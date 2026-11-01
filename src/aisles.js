// Shopping list aisles and the keyword table that guesses one for an ingredient.
// Entries are comma separated; a multi-word entry is matched as a phrase and longer
// phrases win over shorter ones, so "coconut milk" is pantry while "milk" is dairy.
// Plurals match automatically (tomato, tomatoes). Anything unmatched goes to "other".
// Households override guesses from the shopping list; those live in the shared document.

export const AISLES = [
  ["veg", "Fruit & veg"],
  ["meat", "Meat & seafood"],
  ["dairy", "Dairy & eggs"],
  ["bakery", "Bakery"],
  ["pantry", "Pantry"],
  ["frozen", "Frozen"],
  ["drinks", "Drinks"],
  ["household", "Household"],
  ["other", "Other"],
];
export const AISLE_LABEL = Object.fromEntries(AISLES);

const AISLE_WORDS = {
  veg: `apple, banana, berries, strawberries, blueberries, raspberries, lemon, lime, orange, mandarin, avocado,
    tomato, cherry tomatoes, cucumber, lettuce, spinach, rocket, kale, cabbage, broccoli, broccolini, cauliflower,
    carrot, celery, capsicum, zucchini, eggplant, pumpkin, sweet potato, potato, onion, red onion, spring onion,
    shallot, leek, garlic, ginger, chilli, chillies, coriander, parsley, basil, mint, dill, thyme, rosemary,
    mushroom, corn, green beans, snow peas, bok choy, pak choy, asian greens, bean sprouts, salad, coleslaw,
    veg, vegetables, herbs, pineapple, mango, grapes, watermelon, kiwi, pear, peach`,
  meat: `chicken, chicken thigh, chicken breast, chicken wings, drumsticks, beef, beef mince, mince, pork, pork mince,
    lamb, lamb mince, steak, sausages, bacon, ham, salami, chorizo, prosciutto, turkey, fish, salmon, prawns, squid,
    barramundi, snapper, white fish, meatballs, ribs, brisket, rump, schnitzel, chops`,
  dairy: `milk, cheese, cheddar, mozzarella, parmesan, feta, haloumi, halloumi, cottage cheese, cream cheese, cream,
    sour cream, thickened cream, yoghurt, greek yoghurt, butter, egg, margarine, tzatziki, hummus, dip, custard`,
  bakery: `bread, sourdough, rolls, bread rolls, buns, burger buns, wraps, tortillas, pita, flatbread,
    flatbread ingredients, naan, bagels, croissants, crumpets, english muffins`,
  pantry: `rice, pasta, spaghetti, penne, noodles, flour, sugar, salt, pepper, oil, olive oil, vegetable oil,
    soy sauce, fish sauce, oyster sauce, sweet chilli sauce, teriyaki sauce, hoisin, sriracha, tomato sauce,
    bbq sauce, mayonnaise, mayo, mustard, vinegar, stock, chicken stock, beef stock, tinned tomatoes,
    canned tomatoes, tomato paste, passata, coconut milk, coconut cream, curry paste, red curry paste,
    green curry paste, taco seasoning, seasoning, spices, cumin, paprika, curry powder, chilli flakes, oregano,
    honey, peanut butter, jam, cereal, oats, lentils, chickpeas, tinned beans, kidney beans, black beans,
    tinned tuna, tuna, couscous, quinoa, breadcrumbs, panko, cornflour, baking powder, vanilla, chocolate,
    tortilla chips, crackers, biscuits, chips, nuts, almonds, peanuts, sesame seeds, sesame oil, stir fry sauce, miso`,
  frozen: `frozen peas, peas, frozen veg, ice cream, frozen berries, dumplings, gyoza, fish fingers, hash browns,
    pizza, puff pastry, pastry, ice`,
  drinks: `water, sparkling water, juice, soft drink, coke, beer, wine, coffee, tea, kombucha`,
  household: `bin bags, dishwashing liquid, dishwasher tablets, paper towel, toilet paper, tissues, foil, cling wrap,
    baking paper, sponges, washing powder, laundry detergent, soap, shampoo, toothpaste, batteries, cat food, dog food`,
};

// compiled once: longest entry first, each as a whole-word regex that also accepts a plural
const AISLE_TERMS = Object.entries(AISLE_WORDS)
  .flatMap(([aisle, list]) =>
    list
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .map((t) => [t, aisle]),
  )
  .sort((a, b) => b[0].length - a[0].length)
  .map(([t, aisle]) => [new RegExp("\\b" + t.replace(/\s+/g, "\\s+") + "(e?s)?\\b"), aisle]);

export function guessAisle(name) {
  const hit = AISLE_TERMS.find(([re]) => re.test(name));
  return hit ? hit[1] : "other";
}
