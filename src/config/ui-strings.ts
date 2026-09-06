export type Lang = "en" | "hi";

export const UI_STRINGS = {
  "scope.india": { en: "India", hi: "भारत" },
  "scope.india-abroad": { en: "India Abroad", hi: "विदेश में भारत" },
  "scope.impact-on-india": { en: "Impact on India", hi: "भारत पर प्रभाव" },
  "scope.world": { en: "World", hi: "विश्व" },
  "scope.for-you": { en: "For You", hi: "आपके लिए" },

  "category.all": { en: "All", hi: "सभी" },
  "category.finance": { en: "Finance", hi: "वित्त" },
  "category.politics": { en: "Politics", hi: "राजनीति" },
  "category.sports": { en: "Sports", hi: "खेल" },
  "category.technology": { en: "Technology", hi: "प्रौद्योगिकी" },
  "category.business-economy": { en: "Business & Economy", hi: "व्यापार और अर्थव्यवस्था" },
  "category.environment": { en: "Environment", hi: "पर्यावरण" },
  "category.education": { en: "Education", hi: "शिक्षा" },
  "category.entertainment": { en: "Entertainment", hi: "मनोरंजन" },
  "category.health": { en: "Health", hi: "स्वास्थ्य" },
  "category.gen-z": { en: "Gen-Z", hi: "जेन-ज़ी" },

  "sort.newest": { en: "Newest", hi: "नवीनतम" },
  "sort.trending": { en: "Today's Top", hi: "आज की प्रमुख खबरें" },
  "sort.popular": { en: "Most Popular", hi: "सबसे लोकप्रिय" },
  "sort.oldest": { en: "Oldest", hi: "सबसे पुराना" },

  "range.live": { en: "Live", hi: "लाइव" },
  "range.1d": { en: "1 Day", hi: "1 दिन" },
  "range.week": { en: "This Week", hi: "इस सप्ताह" },
  "range.month": { en: "This Month", hi: "इस महीने" },
  "range.past-month": { en: "Past Month", hi: "पिछला महीना" },
  "range.year": { en: "Past Year", hi: "पिछला वर्ष" },

  "action.save": { en: "Save", hi: "सहेजें" },
  "action.readOriginal": { en: "Read original", hi: "मूल पढ़ें" },
  "action.compareCoverage": { en: "Compare coverage", hi: "कवरेज की तुलना करें" },
  "action.alsoReportedBy": { en: "Also reported by", hi: "इनके द्वारा भी रिपोर्ट किया गया" },
  "state.opinion": { en: "Opinion/Analysis", hi: "राय/विश्लेषण" },
  "state.newsReport": { en: "News Report", hi: "समाचार रिपोर्ट" },
  "state.headlineOnly": { en: "Summary unavailable — read the original for full context.", hi: "सारांश उपलब्ध नहीं है — पूरे संदर्भ के लिए मूल लेख पढ़ें।" },
  "state.forYouLocked": { en: "Sign in to unlock your personalized feed. Coming in Phase 2.", hi: "अपनी व्यक्तिगत फ़ीड अनलॉक करने के लिए साइन इन करें। यह फेज़ 2 में आएगा।" },
  "state.empty": { en: "No stories yet for this filter. Check back soon.", hi: "इस फ़िल्टर के लिए अभी कोई कहानियाँ नहीं हैं। जल्द ही वापस देखें।" },

  "site.title": { en: "Bharat Lens", hi: "भारत लेंस" },
  "site.tagline": { en: "India-first news intelligence", hi: "भारत-केंद्रित समाचार सूचना" },
} as const satisfies Record<string, { en: string; hi: string }>;

export type UiStringKey = keyof typeof UI_STRINGS;

export function t(key: UiStringKey, lang: Lang): string {
  return UI_STRINGS[key][lang];
}
