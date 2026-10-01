import { Button } from "@/components/ui/button";

export function DocumentPdfLink({ documentId }: { documentId: string }) {
  return (
    <Button asChild variant="outline">
      <a href={`/api/v1/documents/${documentId}/pdf`}>Télécharger le PDF</a>
    </Button>
  );
}
