import { Component, OnInit } from "@angular/core";
import { BattleTrackerComponent } from "app/battle-tracker/battle-tracker.component";
import { PlayerViewComponent } from "app/player-view/player-view.component";
import { CommonModule } from "@angular/common";
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { VersionService } from "app/services/version.service";

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

  constructor(public versionService: VersionService) {}

  // The app used to ship three swappable skins (default / vintage / cyberdeck)
  // behind a navbar switcher, a `?skin=` query param and a
  // `battle-tracker-skin` localStorage key, all of which drove a `skin-*` class
  // on <body>. Cyberdeck is now the app's only visual theme: its rules are the
  // unconditional base in styles.scss, so there is no class to set, nothing to
  // persist and nothing to switch between.
  ngOnInit()
  {
    const params = new URLSearchParams(window.location.search);
    this.mode = params.get("mode") === "player" ? "player" : "gm";
    this.versionService.loadVersion();
  }
}
