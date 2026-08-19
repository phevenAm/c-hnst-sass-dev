import { useEffect, useState } from "react";

import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import styles from "./ImageBlurBlock.module.scss";

type ImageBlurBlockProps = {
  imageUrl: string;
  photographer: string;
  sourceLabel: string;
  creditUrl: string;
};

export default function ImageBlurBlock({ imageUrl, photographer, sourceLabel, creditUrl }: ImageBlurBlockProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const img = new Image();
    img.src = imageUrl;
    if (img.complete) {
      setLoaded(true);
      return;
    }
    const onLoad = () => setLoaded(true);
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [imageUrl]);

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.bgPanel} ${loaded ? styles.loaded : styles.loading}`}>
        <div
          className={styles.bgImage}
          aria-hidden="true"
          style={{
            backgroundImage: `linear-gradient(rgba(1, 15, 15, 0.24), rgba(1, 15, 15, 0.24)), url('${imageUrl}')`,
          }}
        />
        <a
          href={creditUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={styles.photoCredit}
          title={`Photo by ${photographer} on ${sourceLabel}`}
          aria-label={`Photo credit: ${photographer} on ${sourceLabel}`}
        >
          <InfoOutlinedIcon fontSize="inherit" />
        </a>
      </div>
    </div>
  );
}
