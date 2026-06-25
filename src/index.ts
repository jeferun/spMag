import { ScraperService } from './services/scraper';

async function bootstrap() {
  console.log('=== Iniciando Scraper de Jurisprudencia / OEFA ===');
  const scraper = new ScraperService();
  await scraper.run();
  console.log('=== Proceso finalizado ===');
}

bootstrap();
