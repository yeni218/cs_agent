export const DEFAULT_MENU = {
  categories: [
    {
      id: 'baslangiclar',
      name: 'Başlangıçlar',
      items: [
        { id: 'mercimek', name: 'Mercimek Çorbası', description: 'Geleneksel kırmızı mercimek çorbası', price: 65, available: true },
        { id: 'ezogelin', name: 'Ezogelin Çorbası', description: 'Mercimek ve bulgurlu çorba', price: 65, available: true },
        { id: 'cacik', name: 'Cacık', description: 'Yoğurt, salatalık ve nane ile', price: 50, available: true },
        { id: 'humus', name: 'Humus', description: 'Nohut ezmesi, tahin ve zeytinyağı', price: 60, available: true },
        { id: 'sigara_boregi', name: 'Sigara Böreği', description: 'Beyaz peynirli çıtır börek, 4 adet', price: 75, available: true },
        { id: 'patates_kizartma', name: 'Patates Kızartması', description: 'Çıtır patates', price: 55, available: true }
      ]
    },
    {
      id: 'ana_yemekler',
      name: 'Ana Yemekler',
      items: [
        { id: 'adana_kebap', name: 'Adana Kebap', description: 'Acılı el kıyması kebap, lavaş ve közlenmiş sebze ile', price: 220, available: true },
        { id: 'urfa_kebap', name: 'Urfa Kebap', description: 'Acısız el kıyması kebap', price: 220, available: true },
        { id: 'iskender', name: 'İskender Kebap', description: 'Döner kebap, tereyağlı domates sosu ve yoğurt ile', price: 250, available: true },
        { id: 'tavuk_sis', name: 'Tavuk Şiş', description: 'Marine edilmiş tavuk göğsü şiş', price: 180, available: true },
        { id: 'kuzu_sis', name: 'Kuzu Şiş', description: 'Marine edilmiş kuzu eti şiş', price: 260, available: true },
        { id: 'kofte', name: 'Izgara Köfte', description: 'El yapımı dana köfte, pilav ve salata ile', price: 190, available: true },
        { id: 'karisik_izgara', name: 'Karışık Izgara', description: 'Adana, tavuk şiş, köfte ve kuzu pirzola', price: 350, available: true },
        { id: 'ali_nazik', name: 'Ali Nazik', description: 'Közlenmiş patlıcan, yoğurt üzeri kuşbaşı et', price: 240, available: true }
      ]
    },
    {
      id: 'pide_lahmacun',
      name: 'Pide ve Lahmacun',
      items: [
        { id: 'kiymali_pide', name: 'Kıymalı Pide', description: 'Kıyma, domates ve biberli pide', price: 160, available: true },
        { id: 'kasarli_pide', name: 'Kaşarlı Pide', description: 'Kaşar peynirli pide', price: 140, available: true },
        { id: 'kusbasi_pide', name: 'Kuşbaşılı Pide', description: 'Kuşbaşı et, domates ve biberli pide', price: 190, available: true },
        { id: 'lahmacun', name: 'Lahmacun', description: 'İnce hamur üzeri kıymalı, 2 adet', price: 120, available: true }
      ]
    },
    {
      id: 'icecekler',
      name: 'İçecekler',
      items: [
        { id: 'ayran', name: 'Ayran', description: 'Geleneksel yoğurt içeceği', price: 25, available: true },
        { id: 'cola', name: 'Cola', description: '330 ml', price: 35, available: true },
        { id: 'fanta', name: 'Fanta', description: '330 ml', price: 35, available: true },
        { id: 'sprite', name: 'Sprite', description: '330 ml', price: 35, available: true },
        { id: 'su', name: 'Su', description: '500 ml', price: 15, available: true },
        { id: 'salgam', name: 'Şalgam', description: 'Geleneksel şalgam suyu', price: 30, available: true },
        { id: 'cay', name: 'Çay', description: 'Demlik çay', price: 20, available: true },
        { id: 'turk_kahvesi', name: 'Türk Kahvesi', description: 'Geleneksel Türk kahvesi', price: 45, available: true }
      ]
    },
    {
      id: 'tatlilar',
      name: 'Tatlılar',
      items: [
        { id: 'kunefe', name: 'Künefe', description: 'Sıcak peynirli kadayıf tatlısı, kaymak ile', price: 120, available: true },
        { id: 'baklava', name: 'Baklava', description: 'Fıstıklı baklava, 4 dilim', price: 100, available: true },
        { id: 'sutlac', name: 'Sütlaç', description: 'Fırında sütlaç', price: 70, available: true },
        { id: 'kazandibi', name: 'Kazandibi', description: 'Karamelize muhallebi', price: 70, available: true }
      ]
    }
  ]
};

export function getMenu(categoryId = null, menu = DEFAULT_MENU) {
  if (categoryId) {
    const category = menu.categories.find((item) => item.id === categoryId);
    if (!category) return { error: `"${categoryId}" kategorisi bulunamadı.` };
    return {
      category: category.name,
      items: category.items.filter((item) => item.available)
    };
  }

  return {
    categories: menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
      itemCount: category.items.filter((item) => item.available).length,
      items: category.items.filter((item) => item.available)
    }))
  };
}

export function getItemById(itemId, menu = DEFAULT_MENU) {
  for (const category of menu.categories) {
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) return { ...item, category: category.name };
  }
  return null;
}

export function searchMenu(query, menu = DEFAULT_MENU) {
  const normalizedQuery = normalizeTurkish(query);
  if (!normalizedQuery) return { results: [] };

  const results = [];
  for (const category of menu.categories) {
    for (const item of category.items) {
      const searchable = normalizeTurkish(`${item.name} ${item.description} ${item.id}`);
      if (item.available && searchable.includes(normalizedQuery)) {
        results.push({ ...item, category: category.name });
      }
    }
  }

  return results.length > 0
    ? { results }
    : { error: `"${query}" ile eşleşen ürün bulunamadı.` };
}

function normalizeTurkish(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '');
}
