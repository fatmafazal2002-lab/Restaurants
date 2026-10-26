"use client";
import { translateText as tx } from "@/lib/translation";

import { PreferenceControls, usePreferences } from "./preferences";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  Utensils,
  Palette,
  LayoutDashboard,
  ArrowUpRight,
} from "lucide-react";
import { PublicPricing } from "./public-pricing";
import { SessionAccess } from "./session-access";
import { RoleAvatar } from "./role-avatar";
const looks = [
  {
    name: "The neighbourhood café",
    label: "Olive & oat",
    color: "#53634b",
    background: "#eeeee3",
    font: "Georgia, serif",
    radius: 24,
  },
  {
    name: "The modern bistro",
    label: "Ink & cream",
    color: "#303b56",
    background: "#e9edf3",
    font: "Arial, sans-serif",
    radius: 5,
  },
  {
    name: "The lively trattoria",
    label: "Terracotta",
    color: "#9d4936",
    background: "#f6e8dc",
    font: '"Trebuchet MS", sans-serif',
    radius: 16,
  },
];
export function LandingPage() {
  usePreferences();

  const [look, setLook] = useState(0);
  const selected = looks[look];
  return (
    <div className="marketing">
      <a href="#main" className="marketing-skip">
        {tx("Skip to content")}
      </a>
      <header className="marketing-nav">
        <a className="marketing-logo" href="/" aria-label={tx("Mise home")}>
          mise<span>✳</span>
        </a>
        <nav aria-label={tx("Main navigation")}>
          <a href="#product">{tx("The product")}</a>
          <a href="#your-brand">{tx("Your brand")}</a>
          <a href="#pricing">{tx("Pricing")}</a>
          <a href="#services">{tx("Services")}</a>
        </nav>
        <PreferenceControls />
        <SessionAccess />
      </header>
      <main id="main">
        <section className="marketing-hero">
          <div>
            <p className="marketing-kicker">
              {tx("A LITTLE MORE FLOW. A LOT MORE HOSPITALITY.")}
            </p>
            <h1>
              {tx("Good service")}
              <br />
              {tx("starts with")}
              <br />
              <em>{tx("everyone in sync.")}</em>
            </h1>
            <p className="marketing-lead">
              {tx(
                "From the first order to the last plate. Mise brings your guests, kitchen, and floor team together in one restaurant workspace — made to feel like yours.",
              )}
            </p>
            <div className="marketing-actions">
              <a className="marketing-cta" href="/login/admin">
                {tx("Set up your restaurant")}
                <ArrowRight size={18} />
              </a>
              <a href="#product">
                {tx("See how it works")}
                <span>↓</span>
              </a>
            </div>
            <p className="marketing-footnote">
              {tx("Your menu. Your people. Your way of doing things.")}
            </p>
          </div>
          <div
            className="service-scene"
            aria-label={tx("Illustrative Mise service workflow")}
          >
            <div className="scene-label">
              <span className="scene-dot" />
              {tx("A SERVICE, IN HARMONY")} <span>{tx("ILLUSTRATION")}</span>
            </div>
            <div className="scene-ticket">
              <div className="scene-ticket-head">
                <div>
                  <small>{tx("THE DINING ROOM")}</small>
                  <h3>{tx("Table 08")}</h3>
                </div>
                <span className="scene-status">{tx("Order placed")}</span>
              </div>
              <div className="scene-dish">
                <div className="drawn-plate">
                  <span>✳</span>
                </div>
                <div>
                  <strong>{tx("Something delicious.")}</strong>
                  <p>{tx("2 × seasonal favourites")}</p>
                </div>
              </div>
              <div className="scene-ticket-footer">
                {tx("A guest orders. The kitchen knows.")}
                <ArrowRight size={18} />
              </div>
            </div>
            <div className="scene-journey">
              <div>
                <RoleAvatar role="guest" size={56} />
                <span>{tx("Guest")}</span>
              </div>
              <span>→</span>
              <div>
                <RoleAvatar role="kitchen" size={56} />
                <span>{tx("Kitchen")}</span>
              </div>
              <span>→</span>
              <div>
                <RoleAvatar role="service" size={56} />
                <span>{tx("Floor")}</span>
              </div>
            </div>
            <div className="scene-ready">
              <Check size={18} />
              <div>
                <strong>{tx("Ready for a warm welcome.")}</strong>
                <span>{tx("Less back-and-forth. More time for people.")}</span>
              </div>
            </div>
            <span className="scene-star" aria-hidden="true">
              ✳
            </span>
          </div>
        </section>
        <div className="marketing-strip">
          <span>{tx("GUEST ORDERING")}</span>
          <i>✳</i>
          <span>{tx("KITCHEN WORKFLOW")}</span>
          <i>✳</i>
          <span>{tx("FLOOR SERVICE")}</span>
          <i>✳</i>
          <span>{tx("YOUR RESTAURANT IDENTITY")}</span>
        </div>
        <section id="product" className="marketing-section">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">
              {tx("ONE WORKSPACE. EVERY SIDE OF SERVICE.")}
            </p>
            <h2>
              {tx("Everything connected.")}
              <br />
              <em>{tx("Everyone in their element.")}</em>
            </h2>
            <p>
              {tx(
                "Give each person a clear view of what they need to do, while the whole restaurant stays connected.",
              )}
            </p>
          </div>
          <div className="marketing-roles">
            {[
              {
                role: "admin" as const,
                icon: LayoutDashboard,
                title: tx("You run the restaurant."),
                text: tx(
                  "Manage menus, tables, staff roles, and branding from your administration workspace.",
                ),
                link: "/login/admin",
                label: tx("Administration"),
              },
              {
                role: "kitchen" as const,
                icon: ChefHat,
                title: tx("Your kitchen keeps moving."),
                text: tx(
                  "See incoming tickets, start preparation, and mark dishes ready for the floor team.",
                ),
                link: "/login/kitchen",
                label: tx("Kitchen team"),
              },
              {
                role: "service" as const,
                icon: Utensils,
                title: tx("Your floor stays one step ahead."),
                text: tx(
                  "Respond to guest requests, follow ready dishes, and keep track of what has been served.",
                ),
                link: "/login/service",
                label: tx("Floor service"),
              },
            ].map((x) => (
              <article key={x.role}>
                <RoleAvatar role={x.role} size={78} />
                <p className="marketing-kicker">{tx(x.label)}</p>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
                <a href={x.link}>
                  {`${tx("Open")} ${tx(x.label)}`} <ArrowUpRight size={17} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section id="your-brand" className="marketing-brand">
          <div>
            <p className="marketing-kicker">
              {tx("THE SOFTWARE IS OURS. THE FEELING IS YOURS.")}
            </p>
            <h2>
              {tx("Not another restaurant.")}
              <br />
              <em>{tx("Your restaurant.")}</em>
            </h2>
            <p>
              {tx(
                "Make every screen part of your identity. Choose your logo, colors, type, layout, welcome message, and light or dark appearance. Preview it before you save.",
              )}
            </p>
            <div
              className="look-options"
              aria-label={tx("Try an illustrative brand style")}
            >
              {looks.map((x, i) => (
                <button
                  key={tx(x.label)}
                  onClick={() => setLook(i)}
                  aria-pressed={look === i}
                >
                  <span style={{ background: x.color }} />
                  {tx(x.label)}
                </button>
              ))}
            </div>
            <a href="/admin" className="marketing-text-link">
              {tx("Make it your own")}
              <ArrowRight size={17} />
            </a>
          </div>
          <div
            className="brand-demo"
            style={{
              background: selected.background,
              fontFamily: selected.font,
              borderRadius: selected.radius,
            }}
          >
            <small>{tx("INTERACTIVE STYLE PREVIEW · EXAMPLE CONTENT")}</small>
            <div
              className="brand-demo-symbol"
              style={{ color: selected.color }}
            >
              ✳
            </div>
            <h3 style={{ fontFamily: selected.font }}>{tx(selected.name)}</h3>
            <p>
              {tx("A seat at our table.")}
              <br />
              {tx("A little something made for you.")}
            </p>
            <div className="brand-demo-menu">
              <span>{tx("Today's favourites")}</span>
              <span>{tx("Made with care")}</span>
            </div>
            <a
              href="/login/admin"
              style={{
                background: selected.color,
                borderRadius: selected.radius,
              }}
            >
              {tx("Create your own menu")}
              <ArrowRight size={16} />
            </a>
          </div>
        </section>
        <section id="pricing" className="marketing-section">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">{tx("ROOM TO GROW")}</p>
            <h2>
              {tx("A package for")}
              <br />
              <em>{tx("your kind of service.")}</em>
            </h2>
            <p>
              {tx(
                "One restaurant workspace, with room for the tables, people, and dishes that make it yours. Prices are per month, per restaurant, in the displayed currency.",
              )}
            </p>
          </div>
          <PublicPricing />
          <p className="pricing-note">
            {tx(
              "Create a workspace to explore Mise. New restaurants start with Starter capacity. Plan changes are managed by the platform administrator; online subscription checkout is not available yet.",
            )}
          </p>
        </section>
        <section id="services" className="marketing-services">
          <div>
            <p className="marketing-kicker">{tx("WHAT MISE TAKES CARE OF")}</p>
            <h2>
              {tx("From menu setup")}
              <br />
              <em>{tx("to the final plate.")}</em>
            </h2>
          </div>
          <div>
            {[
              [
                "01",
                tx("Digital menu & table ordering"),
                tx(
                  "Build your menu with images, prices, ingredients, and allergens. Guests open their table link, choose dishes, and send orders.",
                ),
              ],
              [
                "02",
                tx("Kitchen & floor coordination"),
                tx(
                  "Follow tickets from placed to preparing, ready, and served. Guests can request help, and the floor team can respond.",
                ),
              ],
              [
                "03",
                tx("Brand & team management"),
                tx(
                  "Give staff their own role-based access. Set the visual identity once and carry it across the restaurant's interfaces.",
                ),
              ],
            ].map(([n, title, body]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-faq">
          <h2>{tx("A few things to know.")}</h2>
          {[
            [
              tx("Do guests need to create an account?"),
              tx(
                "No. Guests can open their table link and start an anonymous ordering session. Customer account sign-in is also available.",
              ),
            ],
            [
              tx("Can kitchen and floor staff see admin settings?"),
              tx(
                "Operational accounts have their own role-limited workspaces. Administrators manage menus, tables, branding, and staff. Only restaurant owners can grant administrator roles.",
              ),
            ],
            [
              tx("Can I change the whole look?"),
              tx(
                "You can change your identity, logo, cover image, colors, body and heading fonts, light/dark mode, interface style, spacing, menu layout, welcome copy, and avatar visibility. These are built-in options, rather than arbitrary code or custom workflow development.",
              ),
            ],
            [
              tx("How do I get my team started?"),
              tx(
                "Create your restaurant, open Team, and create cook or floor-service logins. Share each employee’s temporary sign-in details privately.",
              ),
            ],
            [
              tx("Does Mise process payments?"),
              tx(
                "Payment processing and automated subscription billing are not currently included. The app handles restaurant ordering and service workflows.",
              ),
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="marketing-closing">
          <Palette size={30} />
          <p className="marketing-kicker">
            {tx("LET'S MAKE ROOM FOR BETTER SERVICE.")}
          </p>
          <h2>
            {tx("Your restaurant.")}
            <br />
            {tx("All together.")}
          </h2>
          <a className="marketing-cta" href="/login/admin">
            {tx("Start setting up")}
            <ArrowRight size={18} />
          </a>
        </section>
      </main>
      <footer className="marketing-footer">
        <a className="marketing-logo" href="/">
          mise<span>✳</span>
        </a>
        <p>{tx("A better service, together.")}</p>
        <div>
          <a href="/login/admin">{tx("Restaurant admin")}</a>
          <a href="/platform">{tx("App admin")}</a>
          <a href="/login/kitchen">{tx("Kitchen login")}</a>
          <a href="/login/service">{tx("Floor login")}</a>
        </div>
      </footer>
    </div>
  );
}
