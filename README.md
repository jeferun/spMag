# spMag - Scraper de Jurisprudencia OEFA

Scraper desarrollado en TypeScript para extraer información, navegar y descargar de forma automatizada todos los documentos (PDFs) expuestos en los portales públicos

El sistema está diseñado específicamente para evadir y manejar correctamente la arquitectura **JavaServer Faces (JSF) con PrimeFaces**, persistiendo estados y saltando ofuscaciones de código.

## 🚀 Características Principales

- **Múltiples Fuentes:** Escanea simultáneamente los *tabs* de `consultaDfsai.xhtml` y `consultaTfa.xhtml`.
- **Evasión JSF:** Inyecta automáticamente la cookie de sesión (`JSESSIONID`) y el estado de la vista (`javax.faces.ViewState`) en cada petición AJAX.
- **Auto-Paginación:** Calcula matemáticamente el total de registros ocultos en la grilla dinámica y extrae los datos navegando página por página sin usar un navegador gráfico (Headless nativo).
- **Extracción Ofuscada (Mojarra):** Intercepta la cadena `onclick="mojarra.jsfcljs(...)"` para extraer por fuerza bruta los `IDs` reales de los botones y los tokens temporales (`param_uuid`) necesarios para autorizar las descargas.
- **Tolerancia a Fallos:** Utiliza un sistema de *Backoff Exponencial* para esquivar los errores HTTP 429 (Rate Limiting).
- **Código Limpio:** Configurado con `ESLint` y `Prettier` para asegurar un estándar de desarrollo estricto.

---

## ⚙️ Requisitos Previos

Asegúrate de tener instalados:
- [Node.js](https://nodejs.org/es/) (v16 o superior)
- `npm` (Manejador de paquetes de Node)

## 📦 Instalación

Clona el repositorio e instala las dependencias necesarias:

```bash
# 1. Instalar dependencias
npm install
```

---

## 🏃‍♂️ Cómo Ejecutar el Scraper

Para lanzar la herramienta e iniciar el proceso de extracción y descarga, simplemente ejecuta:

```bash
npm start
```

### ¿Qué sucederá al ejecutarlo?
1. Se conectará a los endpoints de la OEFA y capturará la sesión inicial.
2. Emulará un clic en el botón de **"Buscar"**.
3. Empezará a extraer los metadatos y a descargar los PDFs uno por uno (con pausas intencionales para evitar baneos).
4. Al finalizar, verás dos salidas importantes:
   - **`data.json`**: Un archivo JSON en la raíz del proyecto con la metadata de todos los registros extraídos (Nro de Expediente, Administrado, Sector, URL origen, etc).
   - **`downloads/pdfs/`**: Carpeta donde se guardarán físicamente todos los PDFs bajados con nombres limpios y normalizados.

---

## ⚠️ Puntos Críticos a Tener en Cuenta

1. **Límite de Prueba (Seguridad de Desarrollo):** 
   Actualmente, el archivo `src/services/scraper.ts` tiene comentado una linea de codigo que establece un límite forzado en la función `run()` para extraer **solo 2 páginas (20 registros)** por pestaña. Esto evita descargar accidentalmente los miles de PDFs durante las pruebas, descomentar si se requiere.
   > **Para ejecutarlo completo:** Abre `src/services/scraper.ts` (aprox. línea 40) y elimina o comenta la línea que dice `if (totalPages > 2) totalPages = 2;`.

2. **Rate Limiting:**
   El sistema respeta al servidor destino haciendo una pausa de `1.5 segundos` entre cada página y `1 segundo` entre cada descarga de PDF. **No se recomienda eliminar estas pausas**, ya que la OEFA bloqueará temporalmente tu IP, lo cual el script tendría que mitigar esperando más tiempo mediante el *backoff*.

3. **Archivos Fallidos:**
   Si un PDF llegara a fallar por error de red en medio de la descarga, el sistema registrará su URL y su nombre en un archivo local llamado `failed_downloads.json` en lugar de detener todo el proceso.

---

## 🛠️ Comandos de Desarrollo (Lint y Format)

El proyecto cuenta con validación estática local para mantener el código robusto:

- **Encontrar errores en el código:**
  ```bash
  npm run lint
  ```
- **Reparar errores triviales automáticamente:**
  ```bash
  npm run lint:fix
  ```
- **Formatear el código (2 espacios):**
  ```bash
  npm run format
  ```
