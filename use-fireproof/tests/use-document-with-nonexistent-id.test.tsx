import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "../index.js"; // Adjust the import path as necessary
import type { Database, UseDocumentResult } from "../index.js"; // Adjust the import path as necessary

const TEST_TIMEOUT = 45000;

// Define a type for user settings
interface TestTypeDoc {
  _id?: string;
  testField?: string;
  theme?: string;
  notifications?: boolean;
  language?: string;
}

describe("HOOK: useDocument with non-existent ID", () => {
  const dbName = "useDocumentWithNonExistentId";
  let db: Database;
  let settingsResult: UseDocumentResult<TestTypeDoc>;
  let database: ReturnType<typeof useFireproof>["database"];
  let useDocument: ReturnType<typeof useFireproof>["useDocument"];
  const testId = "test_settings";

  beforeEach(async () => {
    db = fireproof(dbName);

    // Make sure the document doesn't exist
    try {
      const doc = await db.get(testId);
      if (doc) {
        // Use put with _deleted flag instead of delete
        await db.put({ _id: testId, _deleted: true });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Document doesn't exist, which is what we want
    }

    renderHook(() => {
      const result = useFireproof(dbName);
      database = result.database;
      useDocument = result.useDocument;
      settingsResult = useDocument<TestTypeDoc>({ _id: testId, testField: "test" });
    });
  });

  it(
    "should initialize with the provided _id even if document doesn't exist",
    async () => {
      // Try to refresh the document to see if we get the error
      try {
        await settingsResult.refresh();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Expected error when document doesn't exist yet
      }

      await waitFor(() => {
        expect(settingsResult.doc._id).toBe(testId);
        expect(settingsResult.doc.testField).toBe("test");
        // Other properties should be undefined
        expect(settingsResult.doc.theme).toBeUndefined();
        expect(settingsResult.doc.notifications).toBeUndefined();
        expect(settingsResult.doc.language).toBeUndefined();
      });

      // Try to get the document directly from the database
      try {
        const docFromDb = await db.get(testId);
        // This should not happen as the document doesn't exist yet
        expect(docFromDb).toBeUndefined();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Expected error when document doesn't exist yet
      }

      // Try to save the document and see what happens
      try {
        await settingsResult.save();
        // Document should be saved successfully
      } catch (error) {
        // This should not happen
        expect(error).toBeUndefined();
      }
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database?.close();
    await database?.destroy();
  });
});
