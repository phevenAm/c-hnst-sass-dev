import styles from "./ImageBlurBlock.module.scss";

type ImageBlurBlockProps = {
  imageUrl: string;
  photographer: string;
  sourceLabel: string;
  creditUrl: string;
};

export default function ImageBlurBlock({ imageUrl, photographer, sourceLabel, creditUrl }: ImageBlurBlockProps) {
  return (
    <div className={styles.bgPanel}>
      <div
        className={styles.bgImage}
        aria-hidden="true"
        style={{ backgroundImage: `linear-gradient(rgba(1, 15, 15, 0.24), rgba(1, 15, 15, 0.24)), url('${imageUrl}')` }}
      />
      <p className={styles.photoCredit}>
        Photo by{" "}
        <a href={creditUrl} target="_blank" rel="noreferrer noopener">
          {photographer}
        </a>{" "}
        on {sourceLabel}
      </p>
    </div>
  );
}
