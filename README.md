# AppBuilder Prototype

This prototype implements a minimal no-code system to manage multiple website templates (in `websites/<siteName>/`) and dynamically attach data from third-party APIs to placeholders in HTML pages.

How it works

- Add a site via the Admin UI (`/admin`). This creates `websites/<siteName>/`.
- Add API connections for the site (name, url, method, headers).
- Add mappings: placeholder -> (apiName, jsonPath).
- Placeholders in your HTML should be like `{{placeholder}}`.
- When a page is requested the server calls configured APIs, extracts values using the JSON path (dot notation) and replaces placeholders in the HTML before returning.

Quick start (Windows PowerShell)

1. Install dependencies:

```powershell
cd c:\dev\appbuilder
npm install
```

2. Start server:

```powershell
npm start
```

3. Open admin UI: http://localhost:3000/admin
4. Put site files in `websites/<siteName>/index.html` and use placeholders like `{{username}}`.

Example mapping

- API: `usersApi` -> `https://jsonplaceholder.typicode.com/users/1`
- Mapping: placeholder `username` -> apiName `usersApi` jsonPath `name`
- In `index.html` use `<h1>{{username}}</h1>` and the server will replace it.

Notes & limitations

- Prototype only replaces placeholders in `.html` files. CSS/JS are served static.
- No caching, authentication, or advanced templating. Be cautious when using public APIs.
- For production you'd want authentication for admin, caching, templating engine, robust JSON-path support and validation.
