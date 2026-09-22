// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
// ***********************************************

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Visit the home page and wait for it to load
       */
      visitHome(): Chainable<void>;
    }
  }
}

Cypress.Commands.add("visitHome", () => {
  cy.visit("/");
  cy.get("#home-page", { timeout: 15000 }).should("exist");
});

export {};
