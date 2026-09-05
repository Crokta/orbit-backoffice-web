import { API_BASE_URL } from './api/base-url'
import { ApiError, toApiError } from './api/problem'
import { getAccessToken, refreshAccessToken } from './auth/session'

/**
 * Downloads a server-streamed file — an `export.csv` route — to the operator's disk.
 *
 * The access token lives in memory and goes out as a header, so a plain `<a href>` cannot
 * fetch these; the request is made here with the same credentials as every other call.
 *
 * Where the browser offers the File System Access API the response body is piped straight
 * to the chosen file, chunk by chunk, so a million-row ledger export never sits in memory
 * on either side. Elsewhere it is collected into a blob and saved through an anchor, which
 * still streams from the server but buffers in the tab.
 */
export async function downloadFile(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  fallbackName = 'export.csv',
): Promise<void> {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  let response = await send(url)

  if (response.status === 401 && (await refreshAccessToken())) {
    response = await send(url)
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.body === null) {
    throw new ApiError({ title: 'The export was empty', status: 502, code: 'export.empty' })
  }

  const filename = fileNameFrom(response.headers.get('Content-Disposition')) ?? fallbackName

  const picker = (window as Window & { showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle> }).showSaveFilePicker

  if (picker !== undefined) {
    let handle: FileSystemFileHandle

    try {
      handle = await picker({
        suggestedName: filename,
        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
      })
    } catch (error) {
      // The user closed the picker. Not a failure, and dropping the stream cancels the
      // request on the server.
      if (error instanceof DOMException && error.name === 'AbortError') {
        await response.body.cancel()
        return
      }

      throw error
    }

    await response.body.pipeTo(await handle.createWritable())
    return
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // Revoked on the next tick rather than immediately: Safari cancels the download if the
  // URL disappears before the click has been processed.
  setTimeout(() => { URL.revokeObjectURL(objectUrl) }, 0)
}

function send(url: URL): Promise<Response> {
  const headers = new Headers({ Accept: 'text/csv' })
  const token = getAccessToken()

  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, { headers, credentials: 'include' })
}

/** The name the server suggested, out of `attachment; filename="x.csv"`. */
export function fileNameFrom(disposition: string | null): string | null {
  if (disposition === null) {
    return null
  }

  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)

  return match?.[1] === undefined ? null : decodeURIComponent(match[1].trim())
}

interface SaveFilePickerOptions {
  readonly suggestedName?: string
  readonly types?: readonly { readonly description: string; readonly accept: Record<string, readonly string[]> }[]
}
