"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Images, Maximize2, X } from "lucide-react";

import styles from "@/components/public/RoomDetailPage.module.css";

type RoomImageGalleryProps = {
  roomName: string;
  images: string[];
};

export function RoomImageGallery({ roomName, images }: Readonly<RoomImageGalleryProps>): React.JSX.Element {
  const galleryImages = useMemo(() => images.filter((image) => typeof image === "string" && image.trim().length > 0), [images]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modalIndex, setModalIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const primaryImage = galleryImages[selectedIndex] || galleryImages[0] || "";
  const secondaryImages = [galleryImages[1], galleryImages[2], galleryImages[3]].filter(Boolean) as string[];

  function openModal(index: number): void {
    if (galleryImages.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, galleryImages.length - 1));
    setSelectedIndex(nextIndex);
    setModalIndex(nextIndex);
    setIsModalOpen(true);
  }

  function closeModal(): void {
    setIsModalOpen(false);
  }

  function stepImage(direction: -1 | 1): void {
    if (galleryImages.length === 0) return;
    setModalIndex((current) => {
      const next = (current + direction + galleryImages.length) % galleryImages.length;
      setSelectedIndex(next);
      return next;
    });
  }

  return (
    <>
      <section className={styles.roomGalleryShell}>
        <div className={styles.roomGalleryHeader}>
          <div>
            <div className={styles.roomGalleryKicker}>Room photos</div>
            <h3 className={styles.roomGalleryTitle}>{roomName}</h3>
          </div>
          <button type="button" className={styles.roomGallerySeeMore} onClick={() => openModal(0)}>
            <Images size={16} />
            See more {galleryImages.length > 0 ? `(${galleryImages.length})` : ""}
          </button>
        </div>

        <div className={styles.roomGalleryGridLarge}>
          <button type="button" className={styles.roomGalleryMainButton} onClick={() => openModal(selectedIndex)}>
            {primaryImage ? (
              <img className={styles.roomGalleryMainImage} src={primaryImage} alt={`${roomName} photo 1`} />
            ) : (
              <div className={styles.roomGalleryPlaceholder}>Room Image</div>
            )}
            <span className={styles.roomGalleryHoverBadge}>
              <Maximize2 size={14} />
              Tap to enlarge
            </span>
          </button>

          <div className={styles.roomGalleryThumbColumn}>
            {secondaryImages.length > 0 ? (
              secondaryImages.map((imageUrl, index) => {
                const imageIndex = index + 1;
                return (
                  <button
                    key={`${roomName}-${imageUrl}-${index}`}
                    type="button"
                    className={styles.roomGalleryThumbButton}
                    onClick={() => {
                      setSelectedIndex(imageIndex);
                      openModal(imageIndex);
                    }}
                  >
                    <img className={styles.roomGalleryThumbImage} src={imageUrl} alt={`${roomName} photo ${imageIndex + 1}`} />
                  </button>
                );
              })
            ) : (
              <div className={styles.roomGalleryThumbPlaceholder}>More photos appear here after upload</div>
            )}
          </div>
        </div>
      </section>

      {isModalOpen ? (
        <div className={styles.roomGalleryModalBackdrop} role="presentation" onClick={closeModal}>
          <div className={styles.roomGalleryModalPanel} role="dialog" aria-modal="true" aria-label={`${roomName} photos`} onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.roomGalleryModalClose} onClick={closeModal} aria-label="Close image viewer">
              <X size={18} />
            </button>
            <div className={styles.roomGalleryModalTopRow}>
              <div>
                <div className={styles.roomGalleryKicker}>Room viewer</div>
                <h3 className={styles.roomGalleryModalTitle}>{roomName}</h3>
              </div>
              <div className={styles.roomGalleryModalCount}>
                {modalIndex + 1} / {galleryImages.length}
              </div>
            </div>
            <div className={styles.roomGalleryModalStage}>
              <button type="button" className={styles.roomGalleryNavButton} onClick={() => stepImage(-1)} aria-label="Previous image">
                <ChevronLeft size={18} />
              </button>
              <img
                className={styles.roomGalleryModalImage}
                src={galleryImages[modalIndex] || primaryImage}
                alt={`${roomName} enlarged view`}
              />
              <button type="button" className={styles.roomGalleryNavButton} onClick={() => stepImage(1)} aria-label="Next image">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className={styles.roomGalleryModalThumbRow}>
              {galleryImages.map((imageUrl, index) => (
                <button
                  type="button"
                  key={`${roomName}-modal-${imageUrl}-${index}`}
                  className={`${styles.roomGalleryModalThumbButton}${index === modalIndex ? ` ${styles.roomGalleryModalThumbButtonActive}` : ""}`}
                  onClick={() => {
                    setModalIndex(index);
                    setSelectedIndex(index);
                  }}
                >
                  <img className={styles.roomGalleryModalThumbImage} src={imageUrl} alt={`${roomName} gallery thumbnail ${index + 1}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
