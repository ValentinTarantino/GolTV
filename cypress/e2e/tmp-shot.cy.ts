describe("tmp", () => {
  it("shot", () => {
    cy.viewport(1280, 200);
    cy.visit("/?nc=81");
    cy.wait(600);
    cy.get("#header-logo span[aria-hidden]").invoke(
      "attr",
      "class",
      "absolute inset-x-0 -bottom-1 h-[3px] origin-left scale-x-100 bg-accent-primary"
    );
    cy.wait(300);
    cy.screenshot("logo-underline", { capture: "viewport" });
    cy.viewport(600, 260);
    cy.visit("/lpf?nc=82");
    cy.wait(300);
    cy.screenshot("ball-a", { capture: "viewport" });
    cy.wait(1500);
    cy.screenshot("ball-b", { capture: "viewport" });
  });
});
