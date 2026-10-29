/** Retailer search links stay valid without inventing a product model or price. */
export function toolShoppingLinks(toolName: string) {
  const query = encodeURIComponent(toolName.trim());
  return [
    { retailer: "Amazon", url: `https://www.amazon.com/s?k=${query}` },
    { retailer: "Home Depot", url: `https://www.homedepot.com/s/${query}` },
    { retailer: "Lowe's", url: `https://www.lowes.com/search?searchTerm=${query}` },
  ];
}