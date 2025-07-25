import { getCategoriesList } from "@lib/data/categories"
import { getCollectionsList } from "@lib/data/collections"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MedusaCTA from "@modules/layout/components/medusa-cta"
import { Text, clx } from "@medusajs/ui"

export default async function Footer({ countryCode }: { countryCode?: string }) {
  // Не убирать async! Не добавлять "use client"!
  const { collections } = await getCollectionsList(0, 6)
  const { product_categories } = await getCategoriesList(0, 6)
  const cc = countryCode || "de"

  return (
    <footer className="border-t border-ui-border-base w-full">
      <div className="content-container flex flex-col w-full font-sans text-base tracking-wider">
        <div className="flex flex-col gap-y-10 xsmall:flex-row items-start justify-between py-20 sm:py-28 md:py-32">
          <div className="mb-10">
            <LocalizedClientLink
              href="/"
              className="text-xl tracking-wider uppercase text-ui-fg-subtle hover:text-ui-fg-base"
            >
              Gmorkl Store
            </LocalizedClientLink>
            {/* Крупные иконки платежных систем */}
            <div className="mt-8 flex flex-row gap-4 items-center">
              <img
                src="/icons/visa.svg"
                alt="Visa"
                className="h-10 w-auto object-contain"
                loading="lazy"
                draggable={false}
              />
              <img
                src="/icons/mastercard.svg"
                alt="Mastercard"
                className="h-10 w-auto object-contain"
                loading="lazy"
                draggable={false}
              />
              <img
                src="/icons/paypal.svg"
                alt="PayPal"
                className="h-10 w-auto object-contain"
                loading="lazy"
                draggable={false}
              />
              {/* Добавь свои остальные иконки тут */}
            </div>
          </div>
          <div className="gap-10 md:gap-x-16 grid grid-cols-2 sm:grid-cols-3 text-base tracking-wider">
            {/* Категории без вложенности для ровных отступов */}
            {product_categories && product_categories.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="uppercase text-ui-fg-base text-sm">Categories</span>
                <ul className="flex flex-col gap-y-2" data-testid="footer-categories">
                  {product_categories.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="hover:text-ui-fg-base text-ui-fg-subtle text-sm"
                        href={`/categories/${c.handle}`}
                        data-testid="category-link"
                      >
                        {c.name}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Коллекции */}
            {collections && collections.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <span className="uppercase text-ui-fg-base text-sm">Collections</span>
                <ul className={clx("flex flex-col gap-y-2 text-ui-fg-subtle text-sm")}>
                  {collections.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="hover:text-ui-fg-base"
                        href={`/collections/${c.handle}`}
                      >
                        {c.title}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Юридический раздел */}
            <div className="flex flex-col gap-y-2">
              <span className="uppercase text-ui-fg-base text-sm">Rechtliches</span>
              <ul className="flex flex-col gap-y-2 text-ui-fg-subtle text-sm">
                <li>
                  <LocalizedClientLink href={`/${cc}/impressum`} className="hover:text-ui-fg-base">
                    Impressum
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink href={`/${cc}/datenschutz`} className="hover:text-ui-fg-base">
                    Datenschutz
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink href={`/${cc}/widerruf`} className="hover:text-ui-fg-base">
                    Widerruf
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink href={`/${cc}/agb`} className="hover:text-ui-fg-base">
                    AGB
                  </LocalizedClientLink>
                </li>
                <li>
                  <a
                    href="https://www.instagram.com/gmorkl/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-ui-fg-base"
                  >
                    <img
                      src="/icons/instagram.jpeg"
                      alt="Instagram"
                      width={20}
                      height={20}
                      className="w-5 h-5"
                    />
                    Instagram
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex w-full mb-16 justify-between text-ui-fg-muted">
          <Text className="text-sm tracking-wide uppercase">
            © {new Date().getFullYear()} Gmorkl Store. All rights reserved.
          </Text>
          <MedusaCTA />
        </div>
      </div>
    </footer>
  )
}
