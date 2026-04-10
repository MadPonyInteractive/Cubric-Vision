# Workspace Architecture

> **AI INSTRUCTION:** This file maps out the high-level routing and workspace areas of the application. 

## 🗺️ Application Flow
The application is currently divided into **Four Primary Workspaces**, plus one hidden developer area.

1. **The Landing Page:** 
   - Handles project selection and creation.
   - Entry point: User selects an existing project or initializes a new one.
   
2. **The Gallery Workspace (Initial Project View):**
   - The default workspace loaded immediately upon entering a project.
   - Displays all media inside the project.

3. **The Card History Workspace:**
   - Triggered when the user clicks/selects a specific card from the gallery.
   - Used for viewing generation history, modifying prompts, and reviewing parameter data.

---

## 🛠️ The Dev Components Page (Hidden)
We have a dedicated testing gallery for all UI components. 
- **Access Rule:** This page is not available to standard users. It is gated by the `test_styles: true` flag located in `dev_configs/app_config.js`.
- **Location:** `js/pages/components.js`.
- **Constraint:** If you build a new `MpiCompound` or UI element, ask the user if they want it added to this test page so they can preview it in isolation.
