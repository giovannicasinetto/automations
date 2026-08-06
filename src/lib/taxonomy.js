// Brand + category derivation.
//
// The clean source for both is the PIM export: if it has a Brand and/or
// Category column, the importer uses those verbatim. When it doesn't, these
// heuristics fill the gap so brand/category rollups work today. A proper
// export always overrides derivation.

// --- Brand dictionary (extend freely). Matched case-insensitively against
// the product name. Longer names first so "Mulino Bianco" beats "Mulino".
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

function deriveBrand(name) {
  if (!name) return null;
  const s = String(name).toLowerCase();
  for (const [needle, brand] of BRAND_LOWER) if (s.includes(needle)) return brand;
  return null;   // unknown -> counts as "Unbranded / other" in rollups
}

// --- Category taxonomy (Casinetto classification from Casinetto_Initial_List).
// Order matters: first matching rule wins, so put specific rules before broad.
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

function deriveCategory(name) {
  if (!name) return null;
  const s = String(name).toLowerCase();
  for (const [cat, needles] of CATEGORY_RULES) {
    for (const n of needles) if (s.includes(n)) return cat;
  }
  return 'Pantry';   // safe default for gourmet ambient goods
}

module.exports = { deriveBrand, deriveCategory, BRANDS, CATEGORY_RULES };
