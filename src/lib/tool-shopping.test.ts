import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toolShoppingLinks } from "./tool-shopping";

describe("tool retailer links", () => {
  it("includes Amazon, Home Depot, and Lowe's for the selected tool", () => {
    const links = toolShoppingLinks(" Caulking gun ");
    assert.deepEqual(links, [
      { retailer: "Amazon", url: "https://www.amazon.com/s?k=Caulking%20gun" },
      { retailer: "Home Depot", url: "https://www.homedepot.com/s/Caulking%20gun" },
      { retailer: "Lowe's", url: "https://www.lowes.com/search?searchTerm=Caulking%20gun" },
    ]);
  });

  it("keeps special characters in the tool query rather than adding URL parameters", () => {
    assert.equal(toolShoppingLinks("Drill/driver & bits")[0]?.url,
      "https://www.amazon.com/s?k=Drill%2Fdriver%20%26%20bits");
  });
});