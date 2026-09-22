import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const home = searchParams.get("home") ?? "Equipo A";
  const away = searchParams.get("away") ?? "Equipo B";
  const league = searchParams.get("league") ?? "Liga";
  const score = searchParams.get("score") ?? "";
  const time = searchParams.get("time") ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          backgroundColor: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Accent bar top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            backgroundColor: "#ccff00",
          }}
        />

        {/* League badge */}
        <div
          style={{
            fontSize: "22px",
            color: "#ccff00",
            letterSpacing: "3px",
            textTransform: "uppercase",
            marginBottom: "24px",
            fontWeight: 700,
          }}
        >
          {league}
        </div>

        {/* Teams */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                color: "#ffffff",
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {home}
            </div>
          </div>

          {score ? (
            <div
              style={{
                fontSize: "64px",
                color: "#ccff00",
                fontWeight: 900,
              }}
            >
              {score}
            </div>
          ) : (
            <div
              style={{
                fontSize: "48px",
                color: "#555",
                fontWeight: 800,
              }}
            >
              vs
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                color: "#ffffff",
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {away}
            </div>
          </div>
        </div>

        {/* Time / Status */}
        {time && (
          <div
            style={{
              marginTop: "24px",
              fontSize: "24px",
              color: "#ff00e6",
              fontWeight: 600,
            }}
          >
            {time}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              backgroundColor: "#ccff00",
            }}
          />
          <span
            style={{
              fontSize: "18px",
              color: "#888",
              letterSpacing: "1px",
            }}
          >
            GolTV Libre — Fútbol en vivo gratis
          </span>
        </div>

        {/* Accent bar bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "6px",
            backgroundColor: "#ccff00",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
