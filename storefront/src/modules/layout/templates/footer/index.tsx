"use client"

import { useState, useEffect } from "react"
import { Text, clx } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MedusaCTA from "@modules/layout/components/medusa-cta"

export default function Footer() {
  const [collections, setCollections] = useState([])
  const [categories, setCategories] = useState([])

  useEffect(() => {
    // Загрузка коллекций
    fetch("/api/collections")
      .then(res => res.json())
      .then(data => setCollections(data.collections || []))

    // Загрузка категорий
    fetch("/api/categories")
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
  }, [])

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
            <div className="mt-6">
              <img
                src="/icons/payments.png"
                alt="Supported Payment Methods"
                className="h-8 w-auto object-contain"
              />
            </div>
          </div>
          <div className="gap-10 md:gap-x-16 grid grid-cols-2 sm:grid-cols-3 text-base tracking-wider">
            <div className="flex flex-col gap-y-2">
              <span className="uppercase text-ui-fg-base text-sm">Categories</span>
              <ul className="grid grid-cols-1 gap-2" data-testid="footer-categories">
                {categories.map((c) => (
                  <li className="flex flex-col gap-2 text-ui-fg-subtle text-sm" key={c.id}>
                    <LocalizedClientLink
                      className="hover:text-ui-fg-base"
                      href={`/categories/${c.handle}`}
                      data-testid="category-link"
                    >
                      {c.name}
                    </LocalizedClientLink>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-y-2">
              <span className="uppercase text-ui-fg-base text-sm">Collections</span>
              <ul className="grid grid-cols-1 gap-2 text-ui-fg-subtle text-sm">
                {collections.map((c) => (
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
            <div className="flex flex-col gap-y-2">
              <span className="uppercase text-ui-fg-base text-sm">GMORKL</span>
              <ul className="grid grid-cols-1 gap-y-2 text-ui-fg-subtle text-sm">
                <li>
                  <LocalizedClientLink href="/about" className="hover:text-ui-fg-base">
                    About
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink href="/gallery" className="hover:text-ui-fg-base">
                    Gallery
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink href="/impressum" className="hover:text-ui-fg-base">
                    Impressum
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
