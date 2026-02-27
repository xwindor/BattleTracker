import { Component, OnInit } from "@angular/core";
import { BattleTrackerComponent } from "app/battle-tracker/battle-tracker.component";
import { PlayerViewComponent } from "app/player-view/player-view.component";
import { CommonModule } from "@angular/common";
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { VersionService } from "app/services/version.service";

type AppSkin = "default" | "alternate" | "vintage" | "cyberdeck";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, NgbNavModule, BattleTrackerComponent, PlayerViewComponent],
  templateUrl: "./app.component.html"
})

export class AppComponent implements OnInit
{
  title = "Battle Tracker";
  mode: "gm" | "player" = "gm";
  skin: AppSkin = "cyberdeck";
  readonly skinOptions: Array<{ id: AppSkin; label: string }> = [
    { id: "default", label: "Default" },
    { id: "vintage", label: "Vintage" },
    { id: "cyberdeck", label: "Cyberdeck" }
  ];
  private readonly skinStorageKey = "battle-tracker-skin";

  constructor(public versionService: VersionService) {}

  ngOnInit()
  {
    const params = new URLSearchParams(window.location.search);
    this.mode = params.get("mode") === "player" ? "player" : "gm";
    this.skin = this.resolveSkin(params.get("skin"), window.localStorage.getItem(this.skinStorageKey));
    this.applySkin();
    this.versionService.loadVersion();
  }

  setSkin(skin: AppSkin) {
    this.skin = skin;
    window.localStorage.setItem(this.skinStorageKey, skin);
    this.applySkin();
  }

  private resolveSkin(querySkin: string | null, savedSkin: string | null): AppSkin {
    if (this.isSkin(querySkin)) {
      window.localStorage.setItem(this.skinStorageKey, querySkin);
      return querySkin;
    }
    if (savedSkin === "vintage" || savedSkin === "cyberdeck") {
      return savedSkin;
    }
    // Migrate legacy/default users to cyberdeck as the new global default.
    window.localStorage.setItem(this.skinStorageKey, "cyberdeck");
    return "cyberdeck";
  }

  private isSkin(value: string | null): value is AppSkin {
    return value === "default" || value === "alternate" || value === "vintage" || value === "cyberdeck";
  }

  private applySkin() {
    document.body.classList.remove("skin-alternate", "skin-vintage", "skin-cyberdeck");
    if (this.skin === "alternate") {
      document.body.classList.add("skin-alternate");
      return;
    }
    if (this.skin === "vintage") {
      document.body.classList.add("skin-vintage");
      return;
    }
    if (this.skin === "cyberdeck") {
      document.body.classList.add("skin-cyberdeck");
      return;
    }
  }
}
