import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "../../users/users.service";
import type { AuthenticatedUser, JwtPayload } from "../auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findAuthenticatedUserById(payload.sub);
    // Deactivated accounts lose access immediately, even with an unexpired token.
    if (!user || !user.active) {
      throw new UnauthorizedException();
    }
    // A password reset/change invalidates every token issued before it.
    const { passwordChangedAt, ...authenticated } = user;
    if (passwordChangedAt && (payload.iat ?? 0) < Math.floor(passwordChangedAt.getTime() / 1000)) {
      throw new UnauthorizedException("Session expired; please log in again");
    }
    return authenticated;
  }
}
