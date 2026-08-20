import styles from "./PageHead.module.css";

export const PageHead = ({ title, subtitle, actions }) => (
  <header className={styles.head}>
    <div>
      <h1 className={`display ${styles.title}`}>{title}</h1>
      {subtitle && <p className={styles.sub}>{subtitle}</p>}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>
);
