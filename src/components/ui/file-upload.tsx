import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_SIZE = 10 * 1024 * 1024;

export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
}

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf: FileText,
  csv: FileSpreadsheet,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
};

export function FileUpload({
  accept = ".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg",
  multiple = true,
  maxSize = MAX_SIZE,
  files,
  onFilesChange,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (newFiles: FileList) => {
      const valid: UploadedFile[] = [];
      for (const f of newFiles) {
        if (f.size > maxSize) continue;
        valid.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: f,
        });
      }
      onFilesChange(multiple ? [...files, ...valid] : valid.slice(0, 1));
    },
    [files, maxSize, multiple, onFilesChange],
  );

  const removeFile = useCallback(
    (id: string) => {
      onFilesChange(files.filter((f) => f.id !== id));
    },
    [files, onFilesChange],
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
  const Icon = (name: string) => FILE_ICONS[ext(name)] ?? FileText;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={disabled}
        />
        <Upload className="size-5 mx-auto mb-1 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Drop files here or click to browse
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          PDF, CSV, Excel, images (max 10MB)
        </p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f) => {
            const Icn = Icon(f.file.name);
            return (
              <div
                key={f.id}
                className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5"
              >
                <Icn className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{f.file.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatSize(f.file.size)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
