## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, drizzle, better-auth, paraglide, mcp

---

## Guidelines

Always read IMPLEMENTATION_PLAN.md to check the current status and next steps. Update it after implementing steps and when new questions or ideas arise. Ask for confirmation before modifying already planned steps or established decisions.

Keep the project scalable and easily maintainable. Better a bit more work now that a lot of work when trying to scale or maintain the project later.

Don't repeat yourself: if something will be probably repeated/reused in the same project, make it reusable (abstracting it as a component, as a function, as a theme variable...).

Before making changes to the repo, take a look at TODO.md: if and only if there are TODOs relevant for the current task, if possible and appropriate, integrate them inside the current task. If the current task contradicts some TODOs, ask what should be done.

---

You should be able to access Better Auth MCP server. If not, consult Better Auth online documentation before touching Better Auth related files.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
