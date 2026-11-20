import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { compare } from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import type { JwtPayload } from "./auth.types";
import type { ChangePasswordDto } from "./dto/change-password.dto";
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
    // A deactivated account gets the same generic error as a wrong password.
    const successful = Boolean(user && passwordMatches && user.active);

    await this.prisma.loginAttempt.create({
      data: {
        email,
        userId: user?.id,
        successful,
      },
    });

    if (!user || !successful) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.issueToken(user);
  }

  /** Any signed-in user changes their own password; returns a fresh token. */
  async changePassword(userId: string, input: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    if (!(await compare(input.currentPassword, user.passwordHash))) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException("New password must be different from the current password");
    }
    await this.users.setOwnPassword(user.id, input.newPassword);
    return this.issueToken(user);
  }

  private async issueToken(user: {
    id: string;
    email: string;
    fullName: string | null;
    role: JwtPayload["role"];
    createdAt: Date;
  }) {
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
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }
}
