import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.me(user.userId);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: { userId: string }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto);
  }
}
