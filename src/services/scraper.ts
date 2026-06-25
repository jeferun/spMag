import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { HttpClient } from '../utils/httpClient';
import { DownloadService } from './downloader';

export interface ScrapedData {
  nroExpediente: string;
  administrado: string;
  unidadFiscalizable: string;
  sector: string;
  nroResolucion: string;
  pdfUrl: string;
  sourceTab: string;
}

export class ScraperService {
  private urls = [
    'https://publico.oefa.gob.pe/repdig/consulta/consultaDfsai.xhtml',
    'https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml',
  ];
  private httpClient: HttpClient;
  private downloader: DownloadService;
  private allData: ScrapedData[] = [];
  private rowsPerPage = 10;

  // Almacenamos el HTML inicial para extraer los inputs del formulario
  private currentHtml: string = '';

  constructor() {
    this.httpClient = new HttpClient();
    this.downloader = new DownloadService();
  }

  public async run() {
    console.log('[SCRAPER] Iniciando proceso en ambas pestañas...');

    for (const targetUrl of this.urls) {
      console.log(`\n======================================================`);
      console.log(`[SCRAPER] Procesando: ${targetUrl}`);
      console.log(`======================================================\n`);

      try {
        // 1. Obtener la primera página para inicializar la sesión y extraer el ViewState
        const getRes = await this.httpClient.client.get(targetUrl);
        this.currentHtml = getRes.data;
        const $ = cheerio.load(this.currentHtml);
        const viewState = $('input[name="javax.faces.ViewState"]').val();

        if (viewState) {
          this.httpClient.setViewState(viewState.toString());
          console.log('[SCRAPER] ViewState inicializado.');
        } else {
          throw new Error('No se pudo obtener el ViewState inicial.');
        }

        // 2. Realizar la búsqueda inicial
        const { total: totalRecords, items: initialItems } = await this.search(targetUrl, $);
        console.log(`[SCRAPER] Se encontraron ${totalRecords} registros en total para esta pestaña.`);

        if (totalRecords > 0) {
          // Procesar y guardar registro por registro de la página actual
          await this.processItems(targetUrl, initialItems);

          let totalPages = Math.ceil(totalRecords / this.rowsPerPage);
          // Límite de seguridad para la prueba (máximo 2 páginas, 20 registros), descomentar si se desea limitar la cantidad de páginas a procesar
          // if (totalPages > 2) totalPages = 2;

          console.log(`[SCRAPER] Total de páginas a procesar: ${totalPages}`);

          for (let page = 1; page < totalPages; page++) {
            console.log(`[SCRAPER] Extrayendo página ${page + 1} de ${totalPages}...`);
            const pageItems = await this.paginate(targetUrl, page);
            
            // Procesar y guardar registro por registro de la nueva página
            await this.processItems(targetUrl, pageItems);
            
            await new Promise((r) => setTimeout(r, 800)); // Pausa reducida entre páginas
          }
        } else {
          console.log('[SCRAPER] No hay datos para extraer con los filtros actuales.');
        }
      } catch (error: any) {
        console.error(`[SCRAPER ERROR] Error crítico en ${targetUrl}: ${error.message}`);
      }
    }
    console.log('[SCRAPER] Proceso completo en todas las pestañas.');
  }

  private getFormInputs($: cheerio.CheerioAPI): URLSearchParams {
    const formData = new URLSearchParams();

    // Extraemos dinámicamente todos los inputs del formulario para no olvidar ninguno (vital en JSF)
    $('#listarDetalleInfraccionRAAForm input, #listarDetalleInfraccionRAAForm select').each((_, el) => {
      const name = $(el).attr('name');
      const value = $(el).val();
      if (name) {
        // Si es el viewState, se obvia acá porque se inyecta manualmente al final actualizado
        if (name !== 'javax.faces.ViewState') {
          formData.append(name, value?.toString() || '');
        }
      }
    });

    return formData;
  }

  private async search(targetUrl: string, $: cheerio.CheerioAPI): Promise<{ total: number; items: ScrapedData[] }> {
    console.log('[SCRAPER] Ejecutando búsqueda principal (clic en Buscar)...');

    const formData = this.getFormInputs($);

    // Sobreescribir o agregar parámetros obligatorios del AJAX de PrimeFaces
    formData.set('javax.faces.partial.ajax', 'true');
    formData.set('javax.faces.source', 'listarDetalleInfraccionRAAForm:btnBuscar');
    // JSF requiere procesar el formulario completo para aceptar los valores de los filtros
    formData.set('javax.faces.partial.execute', 'listarDetalleInfraccionRAAForm');
    formData.set(
      'javax.faces.partial.render',
      'listarDetalleInfraccionRAAForm:pgLista listarDetalleInfraccionRAAForm:txtNroexp',
    );
    formData.set('listarDetalleInfraccionRAAForm:btnBuscar', 'listarDetalleInfraccionRAAForm:btnBuscar');
    formData.set('javax.faces.ViewState', this.httpClient.getViewState());

    const res = await this.httpClient.client.post(targetUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    this.extractAndUpdateViewState(res.data);
    const items = this.extractDataFromPartialResponse(res.data, targetUrl);

    return { total: this.extractTotalRecords(res.data), items };
  }

  private async paginate(targetUrl: string, pageIndex: number): Promise<ScrapedData[]> {
    const first = pageIndex * this.rowsPerPage;
    const $ = cheerio.load(this.currentHtml);
    const formData = this.getFormInputs($);

    formData.set('javax.faces.partial.ajax', 'true');
    formData.set('javax.faces.source', 'listarDetalleInfraccionRAAForm:dt');
    formData.set('javax.faces.partial.execute', 'listarDetalleInfraccionRAAForm:dt');
    formData.set('javax.faces.partial.render', 'listarDetalleInfraccionRAAForm:dt');
    formData.set('listarDetalleInfraccionRAAForm:dt', 'listarDetalleInfraccionRAAForm:dt');
    formData.set('listarDetalleInfraccionRAAForm:dt_pagination', 'true');
    formData.set('listarDetalleInfraccionRAAForm:dt_first', first.toString());
    formData.set('listarDetalleInfraccionRAAForm:dt_rows', this.rowsPerPage.toString());
    formData.set('javax.faces.ViewState', this.httpClient.getViewState());

    const res = await this.httpClient.client.post(targetUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    this.extractAndUpdateViewState(res.data);
    return this.extractDataFromPartialResponse(res.data, targetUrl);
  }

  private extractTotalRecords(xmlData: string): number {
    // En PrimeFaces, el script de actualización contiene "rowCount: X"
    const match = xmlData.match(/rowCount:\s*(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return 0;
  }

  private extractAndUpdateViewState(xmlData: string) {
    const match = xmlData.match(/<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]><\/update>/);
    if (match && match[1]) {
      this.httpClient.setViewState(match[1]);
    }
  }

  private extractDataFromPartialResponse(xmlData: string, sourceUrl: string): ScrapedData[] {
    const cdataMatch =
      xmlData.match(/<update id="listarDetalleInfraccionRAAForm:pgLista"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/) ||
      xmlData.match(/<update id="listarDetalleInfraccionRAAForm:dt"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/);
    if (!cdataMatch || !cdataMatch[1]) return [];

    const html = cdataMatch[1];
    const $ = cheerio.load(html);
    const rows = $('tbody[id="listarDetalleInfraccionRAAForm:dt_data"] tr').not('.ui-datatable-empty-message');

    let localCount = 0;
    const extracted: ScrapedData[] = [];
    rows.each((i, el) => {
      const cols = $(el).find('td');
      if (cols.length > 0) {
        let downloadBtnId = '';
        // PrimeFaces puede usar a, button, o input para los comandos de descarga
        const btn = $(cols[6]).find('a, button, input[type="image"]');
        if (btn.length > 0) {
          downloadBtnId = btn.attr('id') || btn.attr('name') || '';

          // Si no tiene ID explícito (ej. JSF Mojarra commandLink), extraemos del onclick
          if (!downloadBtnId) {
            const onclickStr = btn.attr('onclick') || '';
            // Extrae 'listarDetalleInfraccionRAAForm:dt:0:j_idt63'
            const match = onclickStr.match(/'(listarDetalleInfraccionRAAForm:dt:\d+:j_idt\d+)'/);
            if (match && match[1]) {
              downloadBtnId = match[1];
            }
          }
        }

        const data: ScrapedData = {
          nroExpediente: $(cols[1]).text().trim(),
          administrado: $(cols[2]).text().trim(),
          unidadFiscalizable: $(cols[3]).text().trim(),
          sector: $(cols[4]).text().trim(),
          nroResolucion: $(cols[5]).text().trim(),
          pdfUrl: downloadBtnId,
          sourceTab: sourceUrl.includes('Dfsai') ? 'DFSAI' : 'TFA',
        };

        // Si encontramos el param_uuid, lo agregamos (algunos JSF lo usan por seguridad)
        const uuidMatch = btn.attr('onclick')?.match(/'param_uuid':'([^']+)'/);
        if (uuidMatch && uuidMatch[1]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data as any).param_uuid = uuidMatch[1];
        }

        extracted.push(data);
        localCount++;
      }
    });

    if (localCount > 0) {
      console.log(`[SCRAPER] Extrayendo ${localCount} registros en la página actual...`);
    }
    
    return extracted;
  }

  private async processItems(targetUrl: string, items: ScrapedData[]) {
    console.log(`[SCRAPER] Procesando secuencialmente ${items.length} registros para la página actual...`);
    
    // JSF es estricto con el estado de sesión (JSESSIONID). Descargar en paralelo corrompe 
    // los PDFs en el servidor. Debe hacerse secuencial, pero con pausa nula o muy baja.
    for (const item of items) {
      // 1. Guardar la data JSON primero por cada registro
      this.allData.push(item);
      this.saveData();

      // 2. Descargar el PDF de este registro
      if (!item.pdfUrl) continue;

      const safeName = `${item.sourceTab}_${item.nroExpediente.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      await this.downloadPdfByPost(targetUrl, item, safeName);
      await new Promise((r) => setTimeout(r, 200)); // Pausa mínima
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async downloadPdfByPost(targetUrl: string, item: any, filename: string) {
    const formData = new URLSearchParams();
    formData.append('listarDetalleInfraccionRAAForm', 'listarDetalleInfraccionRAAForm');
    formData.append(item.pdfUrl, item.pdfUrl);
    if (item.param_uuid) {
      formData.append('param_uuid', item.param_uuid);
    }
    formData.append('javax.faces.ViewState', this.httpClient.getViewState());

    const downloadDir = path.resolve(process.cwd(), 'downloads/pdfs');
    const filePath = path.join(downloadDir, filename);

    if (fs.existsSync(filePath)) {
      console.log(`[DOWNLOAD] PDF ya existe, saltando: ${filename}`);
      return;
    }

    try {
      const response = await this.httpClient.client.post(targetUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'arraybuffer',
      });

      fs.writeFileSync(filePath, response.data);
      console.log(`[DOWNLOAD] PDF Guardado: ${filename}`);
    } catch (error: unknown) {
      console.error(`[DOWNLOAD ERROR] Error al descargar el PDF ${filename}: ${(error as Error).message}`);
    }
  }

  private saveData() {
    try {
      // Usar la librería fs importada sincronamente para garantizar que se escriba
      fs.writeFileSync(path.resolve(process.cwd(), 'data.json'), JSON.stringify(this.allData, null, 2));
    } catch (e: unknown) {
      console.error(`[ERROR] No se pudo guardar data.json: ${(e as Error).message}`);
    }
  }
}
