export const GA_TRACKING_ID = "G-XXXXXXXXXX" // ← замени на свой ID из GA4

export const pageview = (url: string) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("config", GA_TRACKING_ID, {
      page_path: url,
    })
  }
}

export const event = ({ action, params }: { action: string; params: any }) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", action, params)
  }
}
