import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

export class HttpClient {
  public client: AxiosInstance;
  private cookies: string[] = [];
  private viewState: string = '';

  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    // Configurar retries con backoff exponencial para errores 429 u otros
    axiosRetry(this.client, {
      retries: 5,
      retryDelay: (retryCount) => {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[HTTP] Reintentando petición (Intento ${retryCount}), esperando ${delay}ms...`);
        return delay;
      },
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          error.response?.status === 500
        );
      },
    });

    this.client.interceptors.response.use((response) => {
      if (response.headers['set-cookie']) {
        this.updateCookies(response.headers['set-cookie']);
      }
      return response;
    });

    this.client.interceptors.request.use((config) => {
      if (this.cookies.length > 0) {
        config.headers['Cookie'] = this.cookies.join('; ');
      }
      return config;
    });
  }

  private updateCookies(newCookies: string[]) {
    const cookieMap = new Map<string, string>();

    // Parse current cookies
    this.cookies.forEach((c) => {
      const parts = c.split(';');
      const nameValue = parts[0].split('=');
      cookieMap.set(nameValue[0], parts[0]);
    });

    // Parse new cookies
    newCookies.forEach((c) => {
      const parts = c.split(';');
      const nameValue = parts[0].split('=');
      cookieMap.set(nameValue[0], parts[0]);
    });

    this.cookies = Array.from(cookieMap.values());
  }

  public setViewState(viewState: string) {
    this.viewState = viewState;
  }

  public getViewState(): string {
    return this.viewState;
  }
}
