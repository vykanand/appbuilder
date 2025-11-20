# AppBuilder Testing Guide

## Quick Start Test

### 1. Start the Server

```powershell
node server.js
```

### 2. Open Admin Interface

Navigate to: http://localhost:3000/admin

### 3. Create a Test Site

- Click "+ New site"
- Enter name: `test-app`
- Click "Create"

### 4. Add Sample APIs

#### GET API (for testing table generation)

- **API Name**: `users`
- **URL**: `https://jsonplaceholder.typicode.com/users`
- **Method**: `GET`
- Click "Add API"

#### POST API (for testing form generation)

- **API Name**: `createUser`
- **URL**: `https://jsonplaceholder.typicode.com/posts`
- **Method**: `POST`
- **Body Template**:

```json
{
  "title": "Sample Title",
  "body": "Sample Body",
  "userId": 1
}
```

- Click "Add API"

#### DELETE API (for testing delete button)

- **API Name**: `deleteUser`
- **URL**: `https://jsonplaceholder.typicode.com/posts/1`
- **Method**: `DELETE`
- Click "Add API"

### 5. Test Variable Palette Features

#### View API Details

1. Look at the Variable Palette on the right
2. You should see three APIs with colored method badges:
   - `users` - green badge (GET)
   - `createUser` - red badge (POST)
   - `deleteUser` - red badge (DELETE)
3. Click the ⓘ info button next to any API
4. Modal shows:
   - Method description
   - URL
   - Request/response fields
   - Drag & drop hints

### 6. Test GET API (Table Generation)

1. Open or create a page (e.g., `index.html`)
2. In the HTML editor, place cursor where you want the table
3. Drag the `users` API from palette into the editor
4. A complete table component should be inserted:
   - Header with all fields (id, name, email, etc.)
   - Handlebars loops for data rows
5. Click "Save Page"
6. Check Live Preview iframe - table should populate with user data

### 7. Test POST API (Form Generation)

1. Place cursor in editor below the table
2. Drag the `createUser` API from palette
3. A form should be generated with:
   - "createUser — POST Form" header
   - Input for `title`
   - Input for `body`
   - Input for `userId` (type=number, inferred from sample)
   - Submit button
   - Reset button
4. Click "Save Page"
5. In preview, fill out the form and click Submit
6. Should see success alert

### 8. Test DELETE API (Button Generation)

1. Place cursor in editor
2. Drag the `deleteUser` API from palette
3. A red delete button should be generated
4. Click "Save Page"
5. In preview, click the Delete button
6. Should see confirmation dialog
7. After confirming, should see "Deleted" alert

### 9. Test Field Placeholders

1. Expand the `users` API in the palette (click toggle)
2. You'll see child fields: `id`, `name`, `email`, etc.
3. Drag a child field (e.g., `name`) into the editor
4. Should insert: `{{users.name}}`
5. This can be used in custom HTML

### 10. Test Type Inference

Create a new POST API with varied types:

- **API Name**: `testTypes`
- **URL**: `https://httpbin.org/post`
- **Method**: `POST`
- **Body Template**:

```json
{
  "age": 25,
  "email": "test@example.com",
  "active": true,
  "description": "text"
}
```

Drag to editor and verify inputs:

- `age` → type="number"
- `email` → type="email"
- `active` → type="checkbox"
- `description` → type="text"

### 11. Test API List Display

1. Look at the APIs card on the left
2. Each API should show:
   - Name in bold
   - Method badge (colored)
   - URL below
3. Click "Test" button to execute API
4. Response should appear in modal

## Expected Results

### Variable Palette

✅ Shows method badges (green/red)
✅ Inline method labels (GET/POST/etc)
✅ Info buttons work
✅ Info modal shows full API details
✅ Draggable items have hover effects

### GET APIs

✅ Generate table components
✅ Include all response fields as columns
✅ Use {{#each}} loops correctly
✅ Display data in preview

### POST/PUT/PATCH APIs

✅ Generate forms with all fields
✅ Infer correct input types
✅ Include submit handlers
✅ Show success/error alerts
✅ Reset form after submission

### DELETE APIs

✅ Generate red delete buttons
✅ Include confirmation dialog
✅ Execute deletion on confirm

### API List

✅ Shows method badges
✅ Displays URL metadata
✅ Test button works

## Common Issues & Solutions

### Issue: Palette shows "No sample values"

**Cause**: API hasn't been tested yet or returns empty data
**Solution**: Click "Test" button on API first, then refresh site selection

### Issue: Form doesn't detect types correctly

**Cause**: Sample data doesn't match actual schema
**Solution**: Edit the generated HTML to change input types manually

### Issue: Table shows {{placeholders}} instead of data

**Cause**: API isn't returning data or path is incorrect
**Solution**:

- Test API using Test button
- Check response structure
- Verify handlebars syntax matches response structure

### Issue: Info button doesn't show

**Cause**: API hasn't been aggregated yet
**Solution**: Wait a moment after adding API, then reload site data

### Issue: Submit fails with CORS error

**Cause**: External API doesn't allow requests from localhost
**Solution**: Use APIs that support CORS (like jsonplaceholder) or add CORS headers in server

## Advanced Testing

### Test Custom Styling

1. Generate a form
2. Add CSS classes to form elements
3. Save and preview
4. Styles should apply

### Test Nested Data

Add API with nested objects:

```json
{
  "user": {
    "name": "John",
    "address": {
      "city": "NYC"
    }
  }
}
```

Drag child fields to insert: `{{apiName.user.address.city}}`

### Test Array Data

1. GET API returning array
2. Drag to editor
3. Table should auto-generate with loop
4. Each row should display array item

### Test Multiple Forms on One Page

1. Add multiple POST APIs
2. Drag each to different positions in editor
3. Save
4. All forms should work independently

## Performance Testing

### Large Data Sets

- Test with API returning 100+ items
- Table should render without lag
- Pagination not included (future enhancement)

### Multiple APIs

- Add 10+ APIs to one site
- Palette should remain responsive
- Info modals should load quickly

## Browser Compatibility

Test in:

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (if available)

## Success Criteria

After completing all tests, you should be able to:

1. ✅ See method info in palette and API list
2. ✅ View detailed API information via info button
3. ✅ Generate tables for GET APIs via drag-drop
4. ✅ Generate forms for POST/PUT/PATCH APIs
5. ✅ Generate delete buttons for DELETE APIs
6. ✅ Submit forms successfully
7. ✅ See typed inputs (number, email, checkbox)
8. ✅ Use child field placeholders
9. ✅ Test APIs via Test button
10. ✅ Preview all components live

## Reporting Issues

If you find bugs, note:

- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (F12 → Console tab)
- Network tab for API calls

## Next Steps

After basic testing works:

1. Try building a complete CRUD app
2. Customize generated components
3. Add your own APIs
4. Style with custom CSS
5. Deploy website to production

Happy testing! 🚀
