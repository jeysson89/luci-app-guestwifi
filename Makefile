include $(TOPDIR)/rules.mk

LUCI_TITLE:=Guest Wi-Fi - гостевая сеть по расписанию
LUCI_DEPENDS:=+luci-base +firewall4 +ucode-mod-uci
LUCI_PKGARCH:=all

PKG_VERSION:=1.0.0
PKG_RELEASE:=r1

define Package/$(PKG_NAME)/conffiles
/etc/config/guestwifi
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
