# Backend aislado para Apple Review

Este directorio es un backend **independiente** para que Apple pueda revisar la variante `Comandera TPV Usuarios`. No comparte base de datos, red, impresoras ni configuración con La Flor de Cempazúchitl ni con ninguna instalación real.

Ofrece datos exclusivamente ficticios y las operaciones de impresión responden correctamente sin enviar nada a una impresora.

## Credenciales de revisión

Al desplegar, define como secretos:

- `REVIEW_USERNAME`: `apple-review`
- `REVIEW_PASSWORD`: una contraseña temporal única de al menos 16 caracteres.
- `REVIEW_API_KEY`: vacío para el build iOS actual; la aplicación no incluye una clave de API.

En App Store Connect, para `Comandera TPV Usuarios`, se indicará:

1. URL del servidor: la URL `https` generada por el hosting, sin ruta adicional.
2. Usuario y contraseña anteriores.
3. Instrucción: en la pantalla inicial pulse **Configurar servidor**, introduzca la URL, guarde, y después inicie sesión.

## Probar localmente

```powershell
Copy-Item .env.example .env
npm install
npm start
```

La comprobación de salud responde en `http://localhost:4100/api/health`.

## Despliegue

`render.yaml` permite crear un Web Service desde este directorio. Antes del primer despliegue, Render solicitará el secreto `REVIEW_PASSWORD`. Tras obtener la URL pública, se debe comprobar `/api/health` y luego registrar la URL y las credenciales en la ficha de revisión de Apple.
