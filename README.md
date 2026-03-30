# `imperiascm-cli`

CLI para orquestar servicios locales de desarrollo desde terminal y tareas de VS Code.

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

## Publicacion segura

`imp init` genera `.vscode/imperiascm-cli.config.json` y `.vscode/tasks.json` como artefactos locales del workspace. En este repo deben tratarse como archivos no versionables.

Antes de abrir un PR o publicar una release:

1. Revisa `git status` y los archivos staged para detectar fugas accidentales.
2. No subas rutas reales del workspace, nombres internos de repositorio, puertos reales ni valores de `services[].env`.
3. Manten los tokens de npm fuera del repo. El flujo soportado usa el `.npmrc` del perfil de usuario, no uno versionado en el proyecto.
4. Si necesitas ejemplos de configuracion local, usa placeholders o archivos como `.env.example`, nunca credenciales ni valores reales.

## Uso

Inicializa el workspace una vez para generar `.vscode/tasks.json` y `.vscode/imperiascm-cli.config.json`:

```powershell
imp init
```

Despues puedes usar el CLI directamente desde terminal:

```powershell
imp launch-services
imp prepare-workspace
imp stop-services
imp run-service run-repo-a-web
```

Si quieres integracion con VS Code, las tareas generadas invocan el binario global y
pasan la configuracion del workspace:

`imp init` deja `launch services via imperiascm-cli` como tarea `build` por defecto, asi que `Ctrl+Shift+B`
abre el selector de servicios.
El `tasks.json` generado se limita a las tareas minimas de seleccion, preparacion y lanzamiento.

```json
{
  "command": "imp",
  "args": [
    "select-services-to-launch",
    "--config",
    "${workspaceFolder}/.vscode/imperiascm-cli.config.json"
  ]
}
```

La config generada incluye `"$schema"` apuntando al schema publicado en GitHub.
`tasks.json` usa el schema estandar de VS Code.

Si quieres paralelizar tareas por repositorio, puedes configurarlo en `imperiascm-cli.config.json`:

```json
{
  "repositoryTasks": {
    "syncMaxConcurrentRepositories": 4,
    "buildMaxConcurrentRepositories": 2
  }
}
```

Ambos valores son opcionales y por defecto valen `1`, asi que el comportamiento existente sigue siendo secuencial.

## Restricciones v1

- Windows y PowerShell first.
- Sin soporte para `wt.exe` ni multiplexacion externa.
