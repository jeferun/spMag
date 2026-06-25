import * as fs from 'fs';
import * as path from 'path';
import { HttpClient } from '../utils/httpClient';

export class DownloadService {
  private downloadDir: string;

  constructor(downloadDir: string = 'downloads/pdfs') {
    this.downloadDir = path.resolve(process.cwd(), downloadDir);
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  public async downloadPdf(httpClient: HttpClient, url: string, filename: string): Promise<boolean> {
    const filePath = path.join(this.downloadDir, filename);

    // Skip si ya existe
    if (fs.existsSync(filePath)) {
      console.log(`[DOWNLOAD] Archivo ya existe, saltando: ${filename}`);
      return true;
    }

    try {
      console.log(`[DOWNLOAD] Descargando ${filename}...`);
      const response = await httpClient.client.get(url, {
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, _reject) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', (err) => {
          console.error(`[DOWNLOAD ERROR] Error escribiendo archivo ${filename}:`, err.message);
          fs.unlink(filePath, () => {}); // cleanup
          resolve(false);
        });
      });
    } catch (error: unknown) {
      console.error(`[DOWNLOAD ERROR] No se pudo descargar ${filename} (URL: ${url}): ${(error as Error).message}`);
      this.logFailedDownload(url, filename);
      return false;
    }
  }

  private logFailedDownload(url: string, filename: string) {
    const logPath = path.resolve(process.cwd(), 'failed_downloads.json');
    let failedList = [];
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf8');
      try {
        failedList = JSON.parse(data);
      } catch (_e) {
        // Ignore parse errors
      }
    }
    failedList.push({ url, filename, timestamp: new Date().toISOString() });
    fs.writeFileSync(logPath, JSON.stringify(failedList, null, 2));
  }
}
