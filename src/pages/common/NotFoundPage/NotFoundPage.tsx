import { Link, useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";

import styles from "./NotFoundPage.module.scss";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className={`${styles.page} page`}>
      <div className={styles.card}>
        <p className={styles.code}>404</p>
        <h1 className={styles.heading}>Page not found</h1>
        <p className={styles.body}>The page you're looking for doesn't exist, or the link may be out of date.</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Link to="/">
            <Button variant="primary">Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
