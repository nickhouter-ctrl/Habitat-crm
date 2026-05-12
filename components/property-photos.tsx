import { ImagePlus, Star, Trash2 } from "lucide-react";
import Image from "next/image";

import {
  removePropertyImage,
  setPrimaryPropertyImage,
  uploadPropertyImages,
} from "@/app/(app)/properties/actions";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

export function PropertyPhotos({
  propertyId,
  images,
}: {
  propertyId: string;
  images: string[];
}) {
  const upload = uploadPropertyImages.bind(null, propertyId);
  const remove = removePropertyImage.bind(null, propertyId);
  const setPrimary = setPrimaryPropertyImage.bind(null, propertyId);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Foto&apos;s</CardTitle>
        <span className="text-xs text-muted">
          {images.length} {images.length === 1 ? "foto" : "foto's"}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {images.length === 0 ? (
          <p className="text-sm text-muted">
            Nog geen foto&apos;s. De eerste foto wordt automatisch de hoofdfoto op de
            website.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((url, i) => (
              <li
                key={url}
                className="group relative overflow-hidden rounded-lg border bg-background"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                    hoofdfoto
                  </span>
                )}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {i !== 0 && (
                    <form action={setPrimary}>
                      <input type="hidden" name="url" value={url} />
                      <button
                        title="Maak hoofdfoto"
                        className="rounded bg-white/90 p-1 text-foreground shadow-sm transition-colors hover:bg-white"
                      >
                        <Star className="size-3.5" />
                      </button>
                    </form>
                  )}
                  <form action={remove}>
                    <input type="hidden" name="url" value={url} />
                    <button
                      title="Verwijderen"
                      className="rounded bg-white/90 p-1 text-danger shadow-sm transition-colors hover:bg-white"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          action={upload}
          encType="multipart/form-data"
          className="flex flex-wrap items-center gap-3 border-t pt-4"
        >
          <Input
            type="file"
            name="photos"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
            className="max-w-xs cursor-pointer py-1.5 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-background file:px-2 file:py-1 file:text-sm"
          />
          <Button type="submit" size="sm">
            <ImagePlus className="size-4" /> Uploaden
          </Button>
          <span className="text-xs text-muted">
            JPG / PNG / WebP / AVIF · max 25 MB per foto · meerdere tegelijk mogelijk.
          </span>
        </form>
      </CardContent>
    </Card>
  );
}
