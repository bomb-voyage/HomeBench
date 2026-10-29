import { describe, expect, it } from "vitest";
import { materialImageContext } from "./material-image-context";

describe("material image project context", () => {
  it("keeps front-yard fencing details even with a generic title", () => {
    const context = JSON.parse(materialImageContext({
      title: "Front yard",
      description: "I want to fence the front yard",
      question: "Which fencing material would you like?",
      spec: { project_type: "fencing", location: "front yard" },
    }));
    expect(context.details.project_type).toBe("fencing");
    expect(context.details.location).toBe("front yard");
    expect(context.description).toBe("I want to fence the front yard");
  });
  it("captures details at the question rather than changing previous examples", () => {
    const spec = { project_type: "tile", location: "bathroom floor" };
    const context = materialImageContext({ title: "Bathroom", question: "Tile type?", spec });
    spec.location = "kitchen wall";
    expect(JSON.parse(context).details.location).toBe("bathroom floor");
  });
});