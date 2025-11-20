# AppBuilder - Full-Featured Frontend Development Tool

## Overview

AppBuilder is now a comprehensive no-code frontend development platform that handles all HTTP methods with intelligent drag-and-drop UI generation, automatic field mapping, and complete API integration.

## Key Features

### 1. **Smart HTTP Method Support**

All HTTP methods are fully supported with method-specific UI generation:

#### GET (Fetch/Read Operations)

- **Auto-generates display components**: Tables with headers and data rows
- **Handlebars templating**: Automatic loop generation for arrays
- **Use case**: Displaying lists, search results, dashboards

#### POST (Create Operations)

- **Auto-generates forms**: Input fields with labels
- **Type inference**: Detects number, email, checkbox, text inputs from sample data
- **Form handling**: Built-in submit logic with success/error feedback
- **Reset button**: Included for clearing form data

#### PUT/PATCH (Update Operations)

- **Update forms**: Similar to POST but with appropriate messaging
- **Partial update support**: PATCH-specific field handling
- **Pre-population ready**: Fields can be bound to existing data

#### DELETE (Remove Operations)

- **Delete buttons**: Red-styled confirmation buttons
- **Built-in confirmation**: "Are you sure?" dialog before execution
- **Auto-reload**: Page refreshes after successful deletion

#### OPTIONS/HEAD

- **Generic buttons**: Execute and display results

### 2. **Enhanced Variable Palette**

The palette now shows comprehensive API information:

- **HTTP Method Badges**: Color-coded (green for fetch, red for create/modify)
- **Method Labels**: Inline display of GET/POST/PUT/etc
- **Status Indicators**: Shows last response status (200, 404, etc)
- **Info Buttons**: Click ⓘ to see detailed API information

### 3. **Detailed API Information Panel**

Click the info button (ⓘ) on any API to see:

- **Overview**: Method, URL, status, description
- **Query Parameters**: Table of param names and values
- **Request Body Fields**: Field names, types, and sample values
- **Response Fields**: Complete response structure with types
- **Drag & Drop Hints**: Context-specific guidance for each method

### 4. **Intelligent Form Generation**

#### Type Inference

Forms automatically detect input types:

- `number` → `<input type="number">`
- Boolean → `<input type="checkbox">`
- Email patterns → `<input type="email">`
- Default → `<input type="text">`

#### Form Features

- **Labels**: Auto-generated from field names
- **Name attributes**: Properly set for form serialization
- **Data attributes**: Alternative selectors for flexibility
- **Submit handling**: Async fetch to API execute endpoint
- **Error handling**: Try-catch with user-friendly alerts
- **Reset functionality**: Clear form after successful submit

### 5. **Display Components for GET APIs**

#### Table Generation

- **Headers**: Auto-created from response field names
- **Data rows**: Handlebars {{#each}} loops for arrays
- **Styling**: Basic borders and padding included
- **Field mapping**: Each column maps to response field

#### Sample Output

```html
<div class="ab-display-component">
  <h3>Users Data</h3>
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
</div>
```

### 6. **Method-Specific Styling**

#### Color Coding

- **Fetch methods** (GET, HEAD, OPTIONS): Green gradient
- **Create/Modify methods** (POST, PUT, PATCH, DELETE): Red/warm gradient

#### Visual Distinctions

- Badges in palette show method type
- Forms have method indicator in header
- Delete buttons are prominently styled in red

### 7. **API Execution Flow**

All generated components connect to the server execute endpoint:

```javascript
/api/sites/{siteName}/endpoints/{apiName}/execute
```

The server:

1. Receives the request with field data
2. Proxies to the actual API endpoint
3. Returns the response to the frontend
4. Frontend displays success/error message

### 8. **Drag & Drop Workflow**

#### For GET APIs (Fetch):

1. Drag API from palette
2. Drop into HTML editor
3. → Table component generated with all fields
4. Save page
5. Preview shows populated data

#### For POST/PUT/PATCH (Forms):

1. Drag API from palette
2. Drop into HTML editor
3. → Form generated with typed inputs
4. Save page
5. Preview shows working form

#### For DELETE:

1. Drag API from palette
2. Drop into HTML editor
3. → Delete button with confirmation
4. Save page
5. Preview shows button with alert

### 9. **Field Placeholder Insertion**

Drag child fields (non-API-root nodes) to insert handlebars:

- Outside loops: `{{apiName.field}}`
- Inside loops: `{{this.field}}`

## Usage Examples

### Example 1: User Management CRUD

1. **Add GET API**: `/api/users` → Returns user array
2. **Drag GET API** → Generates user list table
3. **Add POST API**: `/api/users` with body `{"name":"","email":""}`
4. **Drag POST API** → Generates create user form
5. **Add DELETE API**: `/api/users/:id`
6. **Drag DELETE API** → Generates delete button

### Example 2: Search Form

1. **Add GET API**: `/api/search` with params `{"q":""}`
2. In palette, click ⓘ to see query params
3. Manually create search form:

```html
<form>
  <input name="q" placeholder="Search..." />
  <button>Search</button>
</form>
```

4. Add script to call `/api/sites/{site}/endpoints/search/execute`

### Example 3: Dashboard with Multiple APIs

1. Add GET `/api/stats` → Drag for stats table
2. Add GET `/api/recent` → Drag for recent items
3. Add POST `/api/feedback` → Drag for feedback form
4. All components auto-wire to their APIs
5. Page loads and populates all data automatically

## Technical Architecture

### Client-Side (admin-static/app.js)

**Variable Palette**:

- `renderDataPalette()`: Builds tree with method info
- `showApiDetails()`: Displays comprehensive modal
- Drag handlers set payload with `apiName`, `method`, `fields`, `sample`

**Editor Drop Handler**:

- Detects method type from payload
- Routes to appropriate generator:
  - `method === 'GET'` → table component
  - `method in ['POST','PUT','PATCH']` → form component
  - `method === 'DELETE'` → delete button
  - Else → generic button

**Type Inference**:

- Analyzes `payload.sample` for each field
- Maps JS types to HTML input types
- Special patterns (@ symbol → email)

### Server-Side (server.js)

**Metadata Aggregation**:

- `fetchAPIsForSite()` includes `__meta__` object
- Stores method, status, URL for each API
- Client uses this for badges and info panels

**Execute Endpoint**:

```javascript
POST /api/sites/:siteName/endpoints/:apiName/execute
Body: { body: {...}, params: {...}, headers: {...} }
```

- Proxies to actual API with configured settings
- Merges request overrides with stored config
- Returns response with status

### Generated Component Structure

**Forms**:

```html
<form id="unique-id" data-ab-api="apiName" data-ab-method="POST">
  <div>Title — POST Form</div>
  <div><label>field</label><input name="field" /></div>
  ...
  <button type="submit">Submit</button>
  <button type="reset">Reset</button>
</form>
<script>
  /* inline handler */
</script>
```

**Tables**:

```html
<div id="unique-id" data-ab-api="apiName">
  <h3>API Name Data</h3>
  <table>
    <thead>
      <tr>
        <th>field1</th>
        ...
      </tr>
    </thead>
    <tbody>
      {{#each apiName}}
      <tr>
        <td>{{apiName.field1}}</td>
        ...
      </tr>
      {{/each}}
    </tbody>
  </table>
</div>
```

## Best Practices

### 1. API Configuration

- Always provide sample data or bodyTemplate for accurate field inference
- Include query params in API config for GET APIs
- Set proper headers (Content-Type, Auth) in API config

### 2. Form Design

- Edit generated forms to add validation attributes (`required`, `pattern`)
- Customize labels for user-friendly display
- Add CSS classes for styling

### 3. Display Components

- Customize table styles in the generated HTML
- Add action columns manually (edit/delete buttons per row)
- Enhance with search/filter/pagination if needed

### 4. Testing Workflow

1. Add API in admin
2. Test API using "Test" button
3. Check response structure in modal
4. Drag to editor
5. Save page
6. Preview in iframe or new tab
7. Iterate on styling/labels

## Future Enhancements

- [ ] Visual editor (GrapesJS) blocks for each HTTP method
- [ ] Live validation against API schema
- [ ] Advanced field mapper UI
- [ ] Pre-built CRUD table components with edit/delete
- [ ] Search/filter/pagination helpers
- [ ] File upload support for POST
- [ ] Authentication/token management UI

## Troubleshooting

**Forms don't submit?**

- Check browser console for errors
- Verify API name matches exactly
- Ensure server is running

**Table shows {{placeholders}}?**

- API may not be returning data
- Check API Test button result
- Verify handlebars syntax

**Wrong input types generated?**

- Edit HTML manually to change `type="..."`
- Sample data may not match actual schema
- Add type hints in bodyTemplate

**Delete button doesn't work?**

- Confirmation may be blocked by browser
- Check if DELETE endpoint exists and is configured
- Verify execute endpoint returns success

## Summary

AppBuilder is now a complete frontend development tool that:
✅ Supports all HTTP methods with appropriate UI generation
✅ Shows comprehensive API information in palette
✅ Generates forms, tables, and buttons via drag-drop
✅ Infers input types from sample data
✅ Auto-wires all components to server execute endpoint
✅ Provides detailed API docs and hints
✅ Color-codes methods for quick visual identification
✅ Handles success/error states in generated components

Start building complete CRUD applications with zero manual JavaScript!
