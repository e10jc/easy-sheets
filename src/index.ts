import { google, sheets_v4 } from 'googleapis'
import { JWTOptions } from 'google-auth-library'
import { camelCase } from 'lodash'
import { promisify } from 'util'

interface ServiceAccountCreds {
  auth_provider_x509_cert_url: string
  auth_uri: string
  client_email: string
  client_id: string
  client_x509_cert_url: string
  private_key: string
  private_key_id: string
  project_id: string
  token_uri: string
  type: string
}

const buildRange = (range: string, sheet?: string) => (sheet ? `${sheet}!${range}` : range)

export default class EasySheets {
  private serviceAccountCreds: ServiceAccountCreds
  private spreadsheetId: string

  public sheets?: sheets_v4.Sheets

  public constructor(spreadsheetId: string, creds64: string) {
    this.spreadsheetId = spreadsheetId
    this.serviceAccountCreds = JSON.parse(Buffer.from(creds64, 'base64').toString()) as ServiceAccountCreds
  }

  public addRow = async (values: unknown[], opts: { sheet?: string } = {}): Promise<boolean> => {
    const sheets = await this.authorize()

    await sheets.spreadsheets.values.append({
      range: buildRange('A1:A5000000', opts.sheet),
      requestBody: { values: [values] },
      spreadsheetId: this.spreadsheetId,
      valueInputOption: 'USER_ENTERED',
    })

    return true
  }

  public addMultipleRows = async (values: unknown[][], opts: { sheet?: string } = {}): Promise<boolean> => {
    const sheets = await this.authorize()

    await sheets.spreadsheets.values.append({
      range: buildRange('A1:A5000000', opts.sheet),
      requestBody: { values: values },
      spreadsheetId: this.spreadsheetId,
      valueInputOption: 'USER_ENTERED',
    })

    return true
  }

  public addSheet = async (title: string): Promise<boolean> => {
    const sheets = await this.authorize()

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
              },
            },
          },
        ],
      },
    })

    return true
  }

  public authorize = async (): Promise<sheets_v4.Sheets> => {
    if (!this.sheets) {
      const oauth2Client = new google.auth.JWT({
        email: this.serviceAccountCreds.client_email,
        key: this.serviceAccountCreds.private_key,
        scopes: ['https://spreadsheets.google.com/feeds'],
      } as JWTOptions)

      const authorize = promisify(oauth2Client.authorize).bind(oauth2Client)
      await authorize()

      this.sheets = google.sheets({
        auth: oauth2Client,
        version: 'v4',
      })
    }

    return this.sheets
  }

  public clearRange = async (range: string, opts: { sheet?: string } = {}): Promise<boolean> => {
    const sheets = await this.authorize()

    await sheets.spreadsheets.values.clear({
      range: buildRange(range, opts.sheet),
      spreadsheetId: this.spreadsheetId,
    })

    return true
  }

  public deleteSheet = async (sheetTitle: string): Promise<boolean> => {
    const sheets = await this.authorize()

    const sheetId = await this.getSheetId(sheetTitle)
    if (!sheetId) return false

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteSheet: {
              sheetId,
            },
          },
        ],
      },
    })

    return true
  }

  public getRange = async <T>(
    range: string,
    opts: { headerRow?: boolean | 'raw'; sheet?: string } = {},
  ): Promise<T[] | unknown[][] | undefined | null> => {
    const sheets = await this.authorize()

    const {
      data: { values },
    } = await sheets.spreadsheets.values.get({
      range: buildRange(range, opts.sheet),
      spreadsheetId: this.spreadsheetId,
    })

    if (opts.headerRow && values) {
      const headerKeys = opts.headerRow === 'raw' ? values[0] : values[0].map(camelCase)

      return values.slice(1).map((row) => {
        return headerKeys.reduce((obj, header, i) => {
          obj[header] = row[i]
          return obj
        }, {})
      })
    } else {
      return values
    }
  }

  public updateRange = async (range: string, values: unknown[][], opts: { sheet?: string } = {}): Promise<boolean> => {
    const sheets = await this.authorize()

    await sheets.spreadsheets.values.update({
      range: buildRange(range, opts.sheet),
      requestBody: { values },
      spreadsheetId: this.spreadsheetId,
      valueInputOption: 'USER_ENTERED',
    })

    return true
  }

  private getSheetId = async (sheetTitle: string): Promise<number | null | undefined> => {
    const sheets = await this.authorize()
    return (await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId })).data.sheets?.find(
      (s) => s.properties?.title === sheetTitle,
    )?.properties?.sheetId
  }
}
