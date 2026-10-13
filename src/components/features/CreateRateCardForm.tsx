"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RateCardUploadFlow } from "./RateCardUploadFlow";

/**
 * Shared "Add rate card" quick-create control — name plus the first version's
 * Excel workbook, through the same template / check / preview / confirm flow
 * as uploading a new version (RateCardUploadFlow). The RateCard and its first
 * version are created together on confirm, so there is no way to reach a
 * zero-version rate card through this form. Used both from the Client detail
 * page (ClientRateCardsSummary) and the Rate Cards library page
 * (RateCardsPanel).
 */
export function CreateRateCardForm({ clientId }: { clientId: string }) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setIsAdding((prev) => !prev)}>
        {isAdding ? "Cancel" : "Add rate card"}
      </Button>

      {isAdding && (
        <div className="mt-3">
          <RateCardUploadFlow clientId={clientId} onDone={() => setIsAdding(false)} />
        </div>
      )}
    </div>
  );
}
