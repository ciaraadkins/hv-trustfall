/** Where the app lives on humanversus.tech. next.config.ts sets it as the basePath. */
export const BASE_PATH = "/trustfall"

/** Where questions about privacy and the terms go. */
export const CONTACT_EMAIL = "ciara@humanversus.com"

/**
 * The DATA and MEMORY pages show every round and the AI's notes, so they only
 * exist when running locally (`npm run dev`), never in a production build.
 */
export const LOCAL_PAGES = process.env.NODE_ENV !== "production"
