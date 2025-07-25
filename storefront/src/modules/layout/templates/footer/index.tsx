// storefront/src/components/Footer.tsx
import Link from "next/link";

// *** Если в будущем понадобятся динамические данные, делаем компонент асинхронным ***
export default async function Footer() {
  // Пример: получить коллекции и категории продуктов из бэкенда Medusa
  let collections: any[] = [];
  let categories: any[] = [];

  try {
    // Используем URL бэкенда из переменной окружения
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!;
    // Запрос коллекций (Product Collections)
    const colRes = await fetch(`${backendUrl}/store/collections`, { cache: 'no-store' });
    if (colRes.ok) {
      const data = await colRes.json();
      collections = data.collections ?? [];
    }
    // Запрос категорий (Product Categories, если используются в Medusa 2.0+)
    const catRes = await fetch(`${backendUrl}/store/product-categories`, { cache: 'no-store' });
    if (catRes.ok) {
      const data = await catRes.json();
      categories = data.product_categories ?? [];
    }
  } catch (error) {
    console.error("Ошибка загрузки категорий/коллекций для футера:", error);
    // В случае ошибки оставляем списки пустыми – футер всё равно отрендерится
  }

  return (
    <footer className="bg-gray-900 text-white py-8">
      <div className="container mx-auto px-6">
        {/* Блок ссылок, например, колонки меню футера */}
        <div className="flex flex-wrap justify-between">
          {/* Ссылки на коллекции продуктов */}
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Коллекции</h4>
            <ul>
              {collections.map(col => (
                <li key={col.id}>
                  <Link href={`/collections/${col.handle}`} className="text-sm hover:underline">
                    {col.title || col.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Ссылки на категории продуктов */}
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Категории</h4>
            <ul>
              {categories.map(cat => (
                <li key={cat.id}>
                  <Link href={`/categories/${cat.handle}`} className="text-sm hover:underline">
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Прочие статические ссылки */}
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Информация</h4>
            <ul>
              <li>
                <Link href="/impressum" className="text-sm hover:underline">
                  Impressum
                </Link>
              </li>
              {/* Другие статические страницы (например, Контакты, Условия использования) */}
              <li>
                <Link href="/terms" className="text-sm hover:underline">
                  Условия использования
                </Link>
              </li>
            </ul>
          </div>
        </div>
        {/* Нижняя строка копирайта */}
        <p className="text-center text-xs mt-8 opacity-75">
          © 2025 MyShop – Все права защищены
        </p>
      </div>
    </footer>
  );
}
