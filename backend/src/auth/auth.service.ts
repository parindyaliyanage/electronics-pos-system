import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { compare } from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import type { JwtPayload } from "./auth.types";
import type { LoginDto } from "./dto/login.dto";

const INVALID_CREDENTIALS = "Invalid email or password";

// A valid bcrypt hash makes unknown-user and wrong-password paths perform the
// same expensive comparison, reducing email-enumeration timing differences.
const DUMMY_PASSWORD_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(credentials: LoginDto) {
    const email = credentials.email.trim().toLowerCase();
    const user = await this.users.findByEmailForAuthentication(email);
    const passwordMatches = await compare(
      credentials.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const successful = Boolean(user && passwordMatches);

    await this.prisma.loginAttempt.create({
      data: {
        email,
        userId: user?.id,
        successful,
      },
    });

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const expiresIn = this.config.get<string>("JWT_EXPIRES_IN", "8h");
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: expiresIn as JwtSignOptions["expiresIn"],
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }
}
