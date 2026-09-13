/**
 * Editable classification config. Deterministic scope/category assignment
 * (src/lib/scope-category) reads only this file — never hardcode keywords
 * into the classifier itself.
 */

export type Scope = "india" | "india-abroad" | "impact-on-india" | "world" | "for-you";

/** `personal: true` marks the reader's own feed. It is assembled from the other
 *  scopes, so it must never be listed as a source scope for itself. */
export const SCOPES: { id: Scope; label: string; personal?: boolean }[] = [
  { id: "india", label: "India" },
  { id: "india-abroad", label: "India Abroad" },
  { id: "impact-on-india", label: "Impact on India" },
  { id: "world", label: "World" },
  { id: "for-you", label: "For You", personal: true },
];

export type Category =
  | "finance"
  | "politics"
  | "sports"
  | "technology"
  | "business-economy"
  | "environment"
  | "education"
  | "entertainment"
  | "health"
  | "gen-z";

export const CATEGORIES: { id: Category; label: string; keywords: string[] }[] = [
  { id: "finance", label: "Finance", keywords: ["stock market", "sensex", "nifty", "rupee", "inflation", "interest rate", "rbi", "mutual fund", "ipo", "bond yield", "forex"] },
  { id: "politics", label: "Politics", keywords: ["election", "parliament", "lok sabha", "rajya sabha", "modi", "opposition", "cabinet", "policy bill", "supreme court", "governor", "chief minister", "president"] },
  { id: "sports", label: "Sports", keywords: ["cricket", "olympics", "football", "tournament", "match", "ipl", "world cup", "athlete", "medal", "wimbledon", "fifa"] },
  { id: "technology", label: "Technology", keywords: ["ai", "artificial intelligence", "startup", "app", "software", "smartphone", "chip", "semiconductor", "cybersecurity", "data breach", "gadget"] },
  { id: "business-economy", label: "Business & Economy", keywords: ["gdp", "economy", "merger", "acquisition", "earnings", "trade deficit", "export", "import", "manufacturing", "corporate", "ceo", "layoffs"] },
  { id: "environment", label: "Environment", keywords: ["climate", "pollution", "monsoon", "wildlife", "emissions", "renewable energy", "deforestation", "heatwave", "flood", "drought"] },
  { id: "education", label: "Education", keywords: ["university", "school", "exam", "admission", "student", "curriculum", "scholarship", "neet", "jee", "board exam"] },
  { id: "entertainment", label: "Entertainment", keywords: ["bollywood", "film", "movie", "box office", "celebrity", "music", "ott", "web series", "actor", "actress"] },
  { id: "health", label: "Health", keywords: ["hospital", "vaccine", "disease", "outbreak", "who", "mental health", "healthcare", "medicine", "doctor", "epidemic"] },
  { id: "gen-z", label: "Gen-Z", keywords: ["gen z", "social media trend", "influencer", "viral", "meme", "tiktok", "instagram reel", "youth culture"] },
];

/**
 * URL path segments that identify a category. Publishers encode their section
 * in the URL ("/sports/", "/business/"), which is a far stronger signal than
 * keyword-matching a headline — checked before keywords during classification.
 */
export const CATEGORY_PATH_HINTS: Record<string, Category> = {
  // sports
  sports: "sports", sport: "sports", cricket: "sports", football: "sports", soccer: "sports",
  baseball: "sports", basketball: "sports", tennis: "sports", olympics: "sports", hockey: "sports",
  golf: "sports", nba: "sports", nfl: "sports",
  // finance
  markets: "finance", market: "finance", stocks: "finance", money: "finance", banking: "finance",
  "personal-finance": "finance", "mutual-funds": "finance", commodities: "finance", ipo: "finance",
  // business & economy
  business: "business-economy", "business-news": "business-economy", economy: "business-economy",
  companies: "business-economy", industry: "business-economy", corporate: "business-economy",
  "media-telecom": "business-economy", autos: "business-economy",
  // technology
  technology: "technology", tech: "technology", gadgets: "technology", science: "technology",
  "science-technology": "technology", ai: "technology",
  // politics
  politics: "politics", elections: "politics", election: "politics", government: "politics",
  parliament: "politics", policy: "politics", diplomacy: "politics",
  // entertainment
  entertainment: "entertainment", movies: "entertainment", bollywood: "entertainment",
  hollywood: "entertainment", film: "entertainment", music: "entertainment", celebrity: "entertainment",
  television: "entertainment", ott: "entertainment",
  // health
  health: "health", healthcare: "health", medicine: "health", wellness: "health",
  // education
  education: "education", "jobs-education": "education", campus: "education", exams: "education",
  // environment
  environment: "environment", climate: "environment", weather: "environment", energy: "environment",
  // gen-z
  trending: "gen-z", viral: "gen-z", "social-media": "gen-z",
};

/**
 * URL path segments marking a story as foreign-desk coverage. An Indian
 * outlet's /world/ story is world news, not India news — without this, every
 * international piece an Indian paper runs lands in the India tab.
 */
export const WORLD_SECTION_SEGMENTS = [
  "world", "world-news", "international", "global", "africa", "americas",
  "europe", "middle-east", "asia-pacific", "mundo", "us-news", "uk-news",
];

/** URL path segments marking opinion/analysis rather than straight news reporting. */
export const OPINION_PATH_SEGMENTS = [
  "opinion", "opinions", "views", "editorial", "editorials", "comment", "commentisfree",
  "analysis", "column", "columns", "columnist", "blogs", "blog", "perspective", "commentary",
];

/** Keywords that mark a story as being about India, used for scope routing. */
export const INDIA_KEYWORDS = [
  "india", "indian", "delhi", "mumbai", "bengaluru", "bangalore", "kolkata", "chennai",
  "hyderabad", "modi", "rupee", "rbi", "bjp", "congress party", "lok sabha", "rajya sabha",
  "new delhi", "indian ocean", "kashmir", "punjab", "gujarat", "maharashtra", "tamil nadu",
];

/** Keywords marking global events that materially affect India (configurable, not hardcoded logic). */
export const IMPACT_ON_INDIA_KEYWORDS = [
  "oil price", "crude oil", "opec", "federal reserve", "fed rate", "us tariff", "trade policy",
  "visa rules", "h-1b", "immigration policy", "supply chain", "geopolitics", "sanctions",
  "shipping route", "red sea", "china border", "export ban", "import duty", "dollar index",
];
