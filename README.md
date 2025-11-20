# AppBuilder - Full-Featured Frontend Development Platform

A comprehensive no-code platform for building data-driven web applications with intelligent drag-and-drop UI generation, complete HTTP method support, and automatic API integration.

## What's New

### Complete HTTP Method Support

- **GET** → Auto-generates data tables
- **POST/PUT/PATCH** → Auto-generates forms with type inference
- **DELETE** → Auto-generates confirmation buttons
- All methods include automatic server-side execution

### Enhanced Variable Palette

- Color-coded method badges (green=fetch, red=create)
- Detailed API information panels (click ⓘ)
- Request/response field documentation
- Smart drag-and-drop hints

### Smart Type Inference

Forms automatically detect:

- Numbers → `<input type="number">`
- Emails → `<input type="email">`
- Booleans → `<input type="checkbox">`
- Default → `<input type="text">`

## How It Works

1. **Add Sites**: Create managed website projects
2. **Configure APIs**: Connect any REST endpoint (GET/POST/PUT/PATCH/DELETE)
3. **Drag & Drop**: Drag APIs from palette into HTML editor
4. **Auto-Generate**: System creates appropriate UI components (tables/forms/buttons)
5. **Save & Preview**: Live preview with actual API data
6. **Deploy**: Serve fully functional data-driven pages

## Quick Start (Windows PowerShell)

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
4. Create a site, add APIs, and start building!

## Key Features

### Intelligent UI Generation

- **GET APIs** → Data display tables with automatic field mapping
- **POST/PUT/PATCH APIs** → Complete forms with typed inputs and validation
- **DELETE APIs** → Styled delete buttons with confirmation dialogs

### Developer-Friendly Tools

- API testing and response inspection
- Real-time live preview
- Comprehensive API documentation in palette
- Handlebars templating for custom layouts
- Visual editor (GrapesJS) integration
- File management and site organization

### Production-Ready Components

- Auto-wired submit handlers
- Success/error feedback
- Form reset functionality
- Type-safe inputs
- Responsive layouts

## Example Workflow

### Building a User Management Page

1. **Add GET API** for user list:

   - Name: `users`
   - URL: `https://jsonplaceholder.typicode.com/users`
   - Method: `GET`

2. **Drag to editor** → Auto-generates:

   ```html
   <table>
     <thead>
       <tr>
         <th>id</th>
         <th>name</th>
         <th>email</th>
       </tr>
     </thead>
     <tbody>
       {{#each users}}
       <tr>
         <td>{{users.id}}</td>
         <td>{{users.name}}</td>
         <td>{{users.email}}</td>
       </tr>
       {{/each}}
     </tbody>
   </table>
   ```

3. **Add POST API** for creating users:

   - Name: `createUser`
   - URL: `https://jsonplaceholder.typicode.com/posts`
   - Method: `POST`
   - Body: `{"name":"","email":""}`

4. **Drag to editor** → Auto-generates form with inputs and submit handler

5. **Save & Preview** → Fully functional page!

## Documentation

- **[FEATURES.md](FEATURES.md)** - Complete feature documentation
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Step-by-step testing instructions

## Architecture

### Client-Side

- Variable palette with method indicators
- Smart drag-drop handlers
- Type inference engine
- Component generators
- GrapesJS visual editor

### Server-Side

- API proxy with execute endpoint
- Metadata aggregation
- Handlebars template processing
- Multi-site file management
- JSON-based configuration

## Advanced Usage

### Custom Styling

Edit generated HTML/CSS to customize appearance:

```html
<form class="my-custom-form">
  <!-- Generated inputs -->
</form>
```

### Field Placeholders

Drag individual fields for custom layouts:

- `{{apiName.field}}` - Direct field access
- `{{this.field}}` - Inside loops
- `{{#each array}}...{{/each}}` - Iteration

### Testing APIs

Click "Test" button on any API to:

- Execute the endpoint
- View response structure
- Check status codes
- Inspect headers

## Notes & Best Practices

- Prototype only replaces placeholders in `.html` files. CSS/JS are served static.
- No caching, authentication, or advanced templating. Be cautious when using public APIs.
- For production you'd want authentication for admin, caching, templating engine, robust JSON-path support and validation.
