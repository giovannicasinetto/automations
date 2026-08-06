// Brand + category derivation for the web app (ESM copy of src/lib/taxonomy.js).
// Keep in sync with the pipeline's version.

const BRANDS = [
  'Mulino Bianco', 'Alfredo\'s Gourmet', 'Alfredo\'s', 'Kinder Bueno', 'Kinder',
  'Barilla', 'Rummo', 'Ferrero', 'Nutella', 'De Cecco', 'Garofalo', 'Divella',
  'Agnesi', 'Gentile', 'Voiello', 'Mutti', 'Cirio', 'Casar', 'Casereccia',
  'Lavazza', 'Illy', 'Kimbo', 'Segafredo', 'Galbani', 'Parmareggio', 'Zanetti',
  'Perugina', 'Baci', 'Bauli', 'Fiasconaro', 'Loison', 'Balocco', 'Motta',
  'Zuegg', 'Rio Mare', 'Callipo', 'Amalfi', 'Tartufina', 'Tartuflanghe',
  'Geofoods', 'Agnoni', 'Sinisi', 'Risovi', 'Ristoris', 'Sardinian', 'Casinetto',
  'San Carlo', 'Pan di Stelle', 'Colussi', 'Misura', 'Granarolo', 'Sterzing',
  'Levoni', 'Negroni', 'Rovagnati', 'Beretta', 'Citterio', 'Fiorucci',
];
const BRAND_LOWER = BRANDS.map(b => [b.toLowerCase(), b]);

export function deriveBrand(name) {
  if (!name) return null;
  const s = String(name).toLowerCase();
  for (const [needle, brand] of BRAND_LOWER) if (s.includes(needle)) return brand;
  return null;
}

const CATEGORY_RULES = [
  ['Pantry – Tomato Base', ['peeled tomato', 'crushed tomato', 'passata', 'chopped tomato', 'tomato base', 'polpa']],
  ['Pantry – Pasta Sauce', ['pasta sauce', 'pesto', 'ragu', 'sugo', 'arrabbiata', 'tomato & basil', 'cherry tomato pasta', 'truffle sauce']],
  ['Pasta & Rice', ['pasta', 'penne', 'spaghetti', 'rigate', 'linguine', 'fettuccine', 'tagliatelle', 'rigatoni', 'fusilli', 'macaroni', 'lasagne sheet', 'gnocchi', 'rice', 'arborio', 'carnaroli', 'risotto', 'polenta']],
  ['Cheese', ['mozzarella', 'parmigiano', 'parmesan', 'stracchino', 'stracciatella', 'burrata', 'gorgonzola', 'pecorino', 'ricotta', 'grana', 'mascarpone', 'provolone', 'fontina', 'taleggio', 'cheese']],
  ['Chilled Meat & Fish', ['prosciutto', 'bresaola', 'mortadella', 'salami', 'salame', 'pancetta', 'coppa', 'speck', 'guanciale', 'ham', 'turkey', 'beef', 'carpaccio', 'langoustine', 'caviar', 'salmon', 'tuna', 'anchov', 'cod', 'shrimp', 'prawn', 'seafood', 'fish']],
  ['Quick Meals', ['ready', 'lasagna', 'lasagne', 'cannelloni', 'ravioli', 'tortellini', 'agnolotti', 'meal', 'pizza margherita']],
  ['Bakery', ['bread', 'colomba', 'panettone', 'pandoro', 'focaccia', 'bauletto', 'croissant', 'brioche', 'grissini', 'taralli', 'biscuit', 'cookie', 'cracker', 'rusk', 'pizza dough', 'baked']],
  ['Flour', ['flour', 'yeast', 'semolina', 'baking']],
  ['Drinks', ['water', 'juice', 'wine', 'prosecco', 'spritz', 'soda', 'coffee', 'espresso', 'cola', 'tea', 'beer', 'aperitif']],
  ['Fruit & Vegetables', ['lemon', 'orange', 'porcini', 'mushroom', 'oregano', 'basil', 'herb', 'artichoke', 'pepper fresh', 'vegetable', 'salad', 'rocket', 'spinach fresh', 'garlic']],
  ['Dairy, Eggs & Chilled', ['milk', 'butter', 'egg', 'yogurt', 'yoghurt', 'cream', 'panna']],
  ['Pantry', ['olive oil', 'extra virgin', 'evo', 'olives', 'salt', 'truffle', 'honey', 'vinegar', 'balsamic', 'capers', 'beans', 'cannellini', 'chickpea', 'lentil', 'chips', 'snack', 'sugar', 'jam', 'marmalade', 'chocolate', 'spread', 'nut', 'pistachio', 'oil']],
  ['Frozen', ['frozen']],
];

export function deriveCategory(name) {
  if (!name) return null;
  const s = String(name).toLowerCase();
  for (const [cat, needles] of CATEGORY_RULES) {
    for (const n of needles) if (s.includes(n)) return cat;
  }
  return 'Pantry';
}
