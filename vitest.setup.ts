import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// testing-library only registers its own auto-cleanup when vitest runs with
// `globals: true`, and this project does not. Without it every render stays in
// the document for the rest of the file, so the second test in a file can find
// the first test's buttons — which reads as a component rendering something it
// does not, or as a query that is suddenly ambiguous.
afterEach(cleanup);
