---
description: Repository Information Overview
alwaysApply: true
---

# AppBuilder - Frontend Development Platform

## Summary

AppBuilder is a comprehensive no-code platform for building data-driven web applications with intelligent drag-and-drop UI generation, complete HTTP method support (GET/POST/PUT/PATCH/DELETE), and automatic API integration. The system auto-generates data tables for GET requests, forms with type inference for POST/PUT/PATCH, and confirmation buttons for DELETE operations. Users can create managed website projects, configure REST endpoints, and generate fully functional pages with live preview capabilities.

## Structure

**Root-Level Components:**
- **server.js** - Main Express.js server handling API proxy, metadata aggregation, and template processing
- **admin.html** - Admin interface markup for site and API management
- **admin-static/** - Frontend application files (app.js, style.css, utils.js) for admin UI
- **websites/demo/** - Demo website templates and sample pages
- **logger.js** - Custom logging utility with file and console output
- **db.json** - JSON-based data storage for sites and API configurations
- **eslinrc.js** - ESLint configuration with airbnb/prettier standards

## Language & Runtime

**Language**: JavaScript (Node.js)  
**Runtime Version**: Node.js (compatible with ES2023 features based on eslint config)  
**Package Manager**: npm  
**Build System**: npm scripts

## Dependencies

**Main Dependencies:**
- **express** ^4.18.2 - Web server framework
- **axios** ^1.5.0 - HTTP client for API requests
- **cors** ^2.8.5 - Cross-Origin Resource Sharing middleware
- **body-parser** ^1.20.2 - Request body parsing middleware
- **lodash.get** ^4.4.2 - Utility for safely accessing nested object properties

**Development Dependencies:**
- **nodemon** ^2.0.22 - Auto-restart on file changes (dev mode)
- **eslint** ^9.39.1 - Code linting and quality analysis
- **babel-eslint** ^10.1.0 - JavaScript parser for eslint
- **prettier** ^3.6.2 - Code formatter
- **stylelint** ^16.25.0 - CSS/SCSS linting

## Build & Installation

**Install dependencies:**
```bash
npm install
```

**Start server (production):**
```bash
npm start
```

**Start server (development with auto-reload):**
```bash
npm run dev
```

**Server runs on:** http://localhost:3000/admin (admin interface)

## ESLint Configuration

Uses airbnb style guide with React support, import/export sorting, unused imports detection, and prettier integration. Configured for ES2023 syntax with babel parser. Enforces strict quality rules including no console, exhaustive deps checking, and single-exit pattern for functions.

## Main Application Entry Points

- **server.js** - Primary backend server initializing Express, routes, and middleware
- **admin-static/app.js** - Frontend admin application with variable palette, drag-drop handling, and component generators
- **admin.html** - HTML template for admin interface
- **admin-static/style.css** - Styling for admin UI
- **admin-static/utils.js** - Utility functions for client-side operations

## Core Features

- **API Management:** Configure GET/POST/PUT/PATCH/DELETE endpoints with request/response metadata
- **UI Auto-Generation:** Tables for GETs, forms with type inference for POST/PUT/PATCH, delete buttons for DELETE
- **Type Inference:** Automatically detects number, email, boolean, and text input types
- **Live Preview:** Real-time rendering of generated components with actual API data
- **Site Management:** Create and manage multiple website projects
- **Multi-Site Support:** Serve different HTML pages from websites/ directory
- **Handlebars Templating:** Template-based HTML generation with field placeholders
- **Visual Editor Integration:** GrapesJS visual editor for custom layouts

## Testing

**Testing Approach:** Manual testing via admin interface  
**Test Guide Location:** TESTING_GUIDE.md (comprehensive step-by-step testing instructions)  
**Test Scope:** 
- Variable palette display and API information
- GET API table generation
- POST/PUT/PATCH form generation with type inference
- DELETE confirmation and execution
- Field placeholder insertion ({{apiName.field}})
- API testing via Test button
- Live preview rendering

**Testing Uses:**
- JSONPlaceholder API (https://jsonplaceholder.typicode.com) for sample data
- httpbin.org for type inference validation

## Development Notes

- No automated test suite (framework: jest configured in eslint but no test runner setup)
- Prototype-only implementation: placeholders replaced only in .html files; CSS/JS served static
- No authentication, caching, or advanced templating in current version
- Best practices for production: Add auth, caching, robust JSON-path validation, and comprehensive error handling
- API responses must be valid JSON; no advanced error recovery
- Uses JSON file storage (db.json) - not suitable for concurrent operations in production

## Documentation

- **README.md** - Complete feature overview and workflow examples
- **FEATURES.md** - Detailed feature documentation
- **TESTING_GUIDE.md** - Step-by-step testing instructions with expected results
