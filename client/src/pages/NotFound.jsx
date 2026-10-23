import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="not-found-orbit">
        <span />
        <span />
        <strong>404</strong>
      </div>
      <p className="eyebrow">Off the map</p>
      <h1>This path is not on the campus map.</h1>
      <p>The page may have moved, or the link might be from an older term.</p>
      <div className="not-found-actions">
        <Link className="btn btn-primary" to="/">
          Back to the campus <Icon name="arrow-right" size={16} />
        </Link>
        <Link className="btn btn-ghost" to="/login">
          Sign in
        </Link>
      </div>
    </div>
  )
}
