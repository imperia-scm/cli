# `imperia-cli`

CLI para orquestar servicios locales de desarrollo desde tareas de VS Code.

## Instalacion

```powershell
npm i -g @imperiascm/cli
```

## Release y publicacion

Para preparar un cambio de version:

```powershell
npm run changeset
```

El flujo recomendado es:

1. Crear el changeset en tu rama.
2. Hacer merge a `main`.
3. Revisar y mergear el Release PR que genera Changesets.
4. Dejar que GitHub Actions publique automaticamente en npm.

Si necesitas publicar manualmente desde tu maquina:

```powershell
npm run version-packages
npm run release
```

Antes de publicar desde GitHub Actions, configura el secreto `NPM_TOKEN` en el repositorio
con permisos de publicacion sobre `@imperiascm/cli`.

## Uso

Inicializa el workspace una vez para generar `.vscode/tasks.json` y `.vscode/imperia-cli.config.json`:

```powershell
imp init
```

Las tareas de VS Code deben invocar el binario global y pasar la configuracion del
workspace:

```json
{
  "command": "imp",
  "args": [
    "prepare",
    "--config",
    "${workspaceFolder}/.vscode/imperia-cli.config.json"
  ],
  "options": {
    "env": {
      "IMPERIA_CLI_VSCODE_TASK": "1"
    }
  }
}
```

La config generada incluye `"$schema"` apuntando al schema publicado en GitHub.
`tasks.json` usa el schema estandar de VS Code.

## Restricciones v1

- Solo soportado desde tareas de VS Code.
- Windows y PowerShell first.
- Sin soporte para `wt.exe` ni multiplexacion externa.
